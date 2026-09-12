# FlyRank Widget Platform

Embeddable lead-capture widgets. A customer designs a widget in the dashboard, pastes one
`<script>` tag into any page, and submissions land validated, spam-filtered, and geo-enriched.
Design: see DESIGN.md. Evidence: see EVIDENCE.md. Build history: see BUILDLOG.md.

## Architecture

```
Owner (browser :3000, same-origin via rewrites) --JWT--> API :4000 --SQL--> Postgres
Customer page (any origin :5500) --CORS--> /widget.vN.js (immutable) + /config (ETag)
Visitor submit --CORS+Idempotency-Key--> validate -> honeypot -> geo A/B -> store -> Inngest event
Background: Inngest dev :8288 --runs--> confirmation fn --writes--> side_effect_log
```

## Stack

Node 20 + Express 5, Postgres 16, Supabase Auth, Inngest, Next.js dashboard, Vanilla JS widget.

## Setup

Prereqs: Node 20, Docker Desktop, a Supabase project.

```bash
# 1. Postgres
docker compose up -d

# 2. API
cd api
npm install
npm run migrate
npm run seed     # idempotent; creates the evaluator account + demo widget (needs keys below)
npm run dev      # :4000
```

```bash
# 3. Inngest Dev Server (second terminal — background jobs need it)
npx inngest-cli@latest dev -u http://localhost:4000/api/inngest --no-discovery
# dashboard: http://localhost:8288
```

```bash
# 4. Owner dashboard (third terminal, optional — the API alone is a complete backend)
cd dashboard
npm install
npm run dev      # :3000, login with the seed credentials below
```

```bash
# 5. Second-origin customer page (fourth terminal, for the cross-origin proof)
npx serve test-site -l 5500
# open http://localhost:5500 — never double-click the file (file:// voids the CORS proof)

Note: capstone.yaml's one-line `run:` is POSIX syntax (Linux / Git Bash). On Windows
PowerShell, follow the per-terminal steps above instead — equivalent commands.
```

### Environment

`api/.env` (gitignored — never commit):

```
PORT=4000
DATABASE_URL=postgres://flyrank:flyrank_dev@localhost:5432/widgetplatform
BASE_URL=http://localhost:4000
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # seed only, server-side
GEO_MOCK=true                                   # false for live geo spot-checks
GEO_MOCK_A_DOWN=false
GEO_MOCK_B_DOWN=false
EMAIL_FAIL=false                                # true to force side-effect failure
INNGEST_DEV=1
SEED_EMAIL=evaluator@flyrank.test
SEED_PASSWORD=<a throwaway password you choose>
```

`dashboard/.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Evaluator login (Probe 1)

Seeded account: `evaluator@flyrank.test` (throwaway dev-only credential, documented here on purpose).
Exchange it for a token — no Supabase account needed on your side:

```bash
curl -X POST "https://<your-project>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <anon-key>" -H "Content-Type: application/json" \
  -d '{"email":"evaluator@flyrank.test","password":"<seed-password>"}'
```

```bash
curl http://localhost:4000/api/me -H "Authorization: Bearer <access_token>"
# -> {"tenantId":"...","supabaseUserId":"..."} — tenant auto-provisioned on first call
```

## Endpoints

| Path | Auth | Description |
| ---- | ---- | ----------- |
| `POST /api/widgets` | Supabase JWT | Create widget → `201` + `Location` |
| `GET /api/widgets` | Supabase JWT | List, `?limit` (max 100, default 20) + `cursor` |
| `GET /api/widgets/:id` | Supabase JWT | One widget (404 for foreign/deleted — never 403) |
| `PATCH /api/widgets/:id` | Supabase JWT | Edit; always bumps `config_version` |
| `DELETE /api/widgets/:id` | Supabase JWT | Soft delete → `204`; history untouched |
| `GET /api/widgets/:id/embed` | Supabase JWT | `<script>` snippet built from `BASE_URL` |
| `GET /api/widgets/:id/submissions` | Supabase JWT | Submissions, `?limit` + `cursor` |
| `GET /api/dashboard/stats[?widgetId=]` | Supabase JWT | Totals, or per-widget summary (counts, 14-day series, geo breakdown) |
| `GET /api/widgets/:id/config` | Public, CORS | Render projection + `ETag`, `max-age=30` |
| `GET /widget.vN.js` | Public, CORS | Immutable bundle (`max-age=31536000`); all versions retained |
| `POST /api/submissions` | Public, CORS, `Idempotency-Key: <uuid>` required | `201` new / `200` replay / `400` / `404` / `413` / `429` |

Error shape everywhere: `{ "error": { "code": "…", "message": "…" } }`. Unexpected bugs are
sanitized `500`s, never stacks.

## Layout

```
api/src/
  config/  db/ (pool, seed)  middleware/ (auth, cors, rateLimit, bodyLimit→errorHandler)
  modules/ (widgets, submissions, dashboard — repository/service/controller/routes each)
  services/geo/ (fallback chain + mock)  inngest/ (client + functions)
  widget-script/dist/ (widget.v1.js, widget.v2.js, … — every version retained)
  app.js  index.js        api/migrations/ (node-pg-migrate)
dashboard/ (Next.js owner app)   test-site/ (plain-HTML second origin)
```

Bundle versions are global and manual (`v1` frozen, `v2` current: submit status line);
per-widget `config_version` rides the config `ETag` and is never in the public body.
