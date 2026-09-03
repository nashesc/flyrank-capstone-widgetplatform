# Embeddable Widget & Lead-Capture Platform — Design Doc

FlyRank Backend Track Capstone. Phase 1 deliverable — committed to repo root before build work starts.

## 1. Problem

A customer wants a lead-capture form (signup / CTA / popover) on their own website without building
backend infrastructure. They should be able to design a widget in a dashboard, paste one `<script>` tag
into any page, and have submissions land in their dashboard — validated, spam-filtered, geo-enriched,
resilient to abuse and dependency failure.

## 2. Stack

| Layer                | Choice                            | Why                                                                         |
| -------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| API                  | Node.js (ESM) + Express 5         | Matches current track stack                                                 |
| DB                   | PostgreSQL via Docker             | Matches BE-03/04                                                            |
| Auth                 | Supabase Auth                     | Direct reuse of BE-04 — widget owners only, no auth needed on public routes |
| Background jobs      | Inngest                           | Direct reuse of BE-06/BE-09 — used for the safe side-effect (email/webhook) |
| Owner dashboard      | Next.js (App Router) + TypeScript | Matches personal background; separate from the widget script                |
| Embeddable widget    | Vanilla JS (no framework)         | Must run unmodified on any third-party page                                 |
| Validation           | Zod                               | Consistent with track usage                                                 |
| Rate limiting        | express-rate-limit                | Per spec's suggested stack                                                  |
| Geo (fallback chain) | ip-api.com → ipapi.co             | Both free, no key                                                           |

## 3. Non-goal (explicit, per spec requirement)

Will NOT build: drag-and-drop widget builder UI, production email delivery, multi-language widgets,
real hosting/CDN, more than 2 widget types, a design-token theming system. Field types are a fixed,
small JSON-driven set (text, email, textarea, checkbox).

## 4. Data model

```
tenants          (id, supabase_user_id UNIQUE, name, created_at)

widgets          (id, tenant_id FK, type, title, description,
                   fields jsonb, button_text, display_options jsonb,
                   config_version int default 1, deleted_at timestamptz null,
                   created_at, updated_at)

submissions      (id, widget_id FK ON DELETE RESTRICT, tenant_id FK [denormalized, server-derived],
                   payload jsonb, idempotency_key text,
                   ip, geo_country, geo_city, geo_provider_used text,
                   created_at)

side_effect_log  (id, submission_id FK, kind text, status text,
                   error text null, attempted_at)
```

Indexes: `widgets(tenant_id)`, `submissions(widget_id)`, `submissions(tenant_id)`,
`submissions(created_at)`, **unique** `submissions(widget_id, idempotency_key)`,
**unique** `tenants(supabase_user_id)`.

`tenant_id` on `submissions` is denormalized and always **server-derived** from the looked-up
widget row (`SELECT tenant_id FROM widgets WHERE id = $1`) — never accepted from the request
body. This is what actually makes the tenant-isolation probe pass; the client can lie about
anything except which authenticated session it's using.

`ON DELETE RESTRICT` on `submissions.widget_id` is the backstop, but `DELETE /api/widgets/:id`
(§6) actually does a soft delete: `UPDATE widgets SET deleted_at = now() WHERE id = $1 AND
tenant_id = $2`. Widget CRUD/list/config/embed queries all add `AND deleted_at IS NULL`;
submissions and dashboard stats are untouched by a soft delete and keep working against a
deleted widget's history. RESTRICT stays as a safety net in case anything ever hard-deletes a
row directly, but soft-delete is the decided behavior, not an open choice.

Renamed `version` → `config_version` to disambiguate from the widget.js **bundle** version, which
is a separate, global number (see §12). `is_spam` dropped — see §8 for why.

## 5. Tenant isolation & provisioning

- **Provisioning:** on every authenticated request, `auth.middleware.js` verifies the Supabase
  JWT via `supabase.auth.getClaims()` (server-side SDK call), not a hand-rolled
  `jsonwebtoken.verify()` against a static secret. New Supabase projects default to **asymmetric**
  JWT signing (RS256/ES256, JWKS-based) as of Oct 2025 — a project created for this capstone will
  almost certainly be on that path, not the legacy shared-secret HS256 flow. `getClaims()`
  verifies against the project's own JWKS/secret automatically regardless of which signing mode
  is active, and does so locally (WebCrypto, cached JWKS) rather than round-tripping to the Auth
  server on every request the way `getUser()` does. It also checks `iss`/`aud` as part of
  standard JWT verification — a token from a different Supabase project fails outright and never
  reaches the upsert, so `sub` is trustworthy once that check passes. Middleware then upserts
  `tenants (supabase_user_id) ON CONFLICT (supabase_user_id) DO UPDATE ... RETURNING id` and sets
  `req.tenantId`. No separate signup flow — a new Supabase user gets a tenant row automatically
  on their first API call.
- **Scoping:** every repository query touching `widgets` or `submissions` includes `tenant_id`
  in the `WHERE` clause itself — never fetch-by-id-then-check-in-application-code. E.g.
  `UPDATE widgets SET ... WHERE id = $1 AND tenant_id = $2`, not `SELECT ... WHERE id = $1` plus
  an `if` after. A row matched by id but wrong tenant returns 404, not 403 — don't confirm the id
  exists to a tenant that shouldn't see it.
- Optional defense-in-depth, not required: Postgres row-level security policies on `widgets`/
  `submissions` keyed to a session-set `tenant_id`. Skip unless you want the extra plumbing —
  the query-scoping above is what the probe actually tests.
- **Evaluator access to Path A:** `seed.js` creates one real Supabase Auth user (not just a bare
  `tenants` row — a JWT has to actually verify, so it has to come from a real signed-in session)
  with fixed, documented credentials. README's setup section includes the one curl against
  Supabase's own `/auth/v1/token?grant_type=password` to exchange those credentials for an
  access token, so Probe 1 ("visible via the dashboard API") is reproducible without the
  evaluator creating a Supabase account.

## 6. API surface — three separate request paths

### Path A — Widget Owner (authenticated, Supabase JWT)

```
POST   /api/widgets                    → 201 + Location header
GET    /api/widgets                    → ?limit (max 100, default 20) & cursor
GET    /api/widgets/:id
PATCH  /api/widgets/:id                → always bumps config_version on any field change
DELETE /api/widgets/:id                → 204, soft delete (deleted_at), see §4
GET    /api/widgets/:id/embed          → returns the <script> snippet, built from BASE_URL env,
                                          not the request Host header
GET    /api/widgets/:id/submissions    → ?limit (max 100, default 20) & cursor, tenant-scoped
GET    /api/dashboard/stats?widgetId=...
```

Dashboard calls this via Next.js `rewrites()` (see §7) so the browser never makes a cross-origin
request to the API — no CORS needed on Path A after all, but for a different reason than the
original draft assumed.

### Path B — Customer Website (public, cached, CORS, no auth)

```
GET /widget.v{N}.js               → versioned bundle, long cache, immutable (see §12)
GET /api/widgets/:id/config       → short-lived cache + ETag, CORS: *
```

The config response is a projection, not the raw row — it excludes `tenant_id`,
`config_version` (used only as the ETag value, not sent as a body field), and any other internal
column. Only what the widget script needs to render (`type`, `title`, `description`, `fields`,
`button_text`, `display_options`) goes over this public endpoint.

### Path C — Website Visitor (public, CORS, protected)

```
POST /api/submissions             → validated, rate-limited, spam-checked, idempotent, CORS + preflight
Header: Idempotency-Key: <client-generated uuid>   — REQUIRED, not optional (see below)
Body:   { "widgetId": "<uuid>", "data": { <fieldName>: value, ... } }
```

`widgetId` is how the handler looks up the widget (and derives `tenant_id` — §4/§5); it is never
read from the request body's `tenant_id`, because there isn't one — the client can't supply it.

Responses: `201` new submission, `200` idempotent replay (same `widget_id` +
`Idempotency-Key`, existing row returned unchanged), `404` unknown or soft-deleted widget, `400`
Zod validation failure _or_ missing/malformed `Idempotency-Key`, `413` oversized body (from the
`bodyLimit` middleware), `429` rate-limited. `Idempotency-Key` is required — public clients can't
be trusted to send it voluntarily, and an optional header means some rows have `NULL`, which
doesn't collide against future retries (`NULL != NULL` in the unique constraint) and quietly
defeats the guarantee shared requirement #5 is asking for. The widget script (§11) generates one
UUID **when the submit action starts** and reuses it for any retry of that same attempt
(network failure, double-click) — it does not mint a fresh UUID per click, which would defeat
idempotency entirely.

## 7. Middleware / cross-cutting concerns

- `auth.middleware.js` — verifies Supabase JWT, upserts/attaches `req.tenantId`, rejects Path A
  without valid auth.
- `cors.middleware.js` — mounted only on the Path B/C routers (`/widget.v*.js`,
  `/api/widgets/:id/config`, `/api/submissions`), **before** those route handlers, not
  app-wide — Path A never needs CORS at all (it's same-origin via Next.js `rewrites()`, below),
  so there's no reason to give it permissive headers by accident. `cors({ origin: '*',
allowedHeaders: ['Content-Type', 'Idempotency-Key'] })` answers `OPTIONS` preflight
  automatically. (The `cors` package reflects whatever the browser's preflight
  `Access-Control-Request-Headers` asked for by default even without `allowedHeaders` set, so
  this isn't strictly required for `Idempotency-Key` to work — but stating it explicitly means
  the contract doesn't depend on a library default someone has to go verify.) Verify this against
  the real `test-site/index.html` on a second port, not curl — curl never triggers a preflight,
  so it can't catch a CORS misconfiguration.
- `rateLimit.middleware.js` — per-IP on Path C (required), `60 requests / 60s` window as a
  starting point. Per-widget is optional — the spec says "and/or"; add it only if per-IP alone
  doesn't feel like enough of a demo. Note for evidence-gathering: Probe 3's burst and Probes
  4-6 all originate from the same dev-machine IP. Run the burst test _last_, or use a short
  enough window (60s) and pause between probes, or the burst will 429 your own later probes.
- `bodyLimit` — `express.json({ limit: '20kb' })`. Form submissions are small; anything bigger
  is either an attack or a bug.
- `validate.middleware.js` — static Zod schemas for widget CRUD; **dynamic** per-widget schema
  for submissions (§8).
- `errorHandler.js` — the single place that maps errors to responses:
  - Known client errors (Zod failure, body-parser syntax error, `entity.too.large`, not-found,
    unauthorized) → clean 4xx JSON, `{ error: { code, message } }`.
  - Anything unhandled → sanitized 500 JSON, no stack trace, logged server-side. **Not every
    error is a 4xx** — an unexpected bug should look like a 500, not get laundered into a 4xx to
    make a probe pass. Probe 2 only requires malformed/oversized _input_ to 4xx, which is already
    true by construction once Zod and the body limit run first.
  - `express-rate-limit`'s own default 429 response doesn't go through `errorHandler.js` unless
    told to — set its `handler` option to emit the same `{ error: { code, message } }` shape as
    everything else, so Probe 3's response looks like the rest of the API instead of a
    differently-shaped 429.
- No real hosting means no reverse proxy in front of Express, so `trust proxy` can stay unset —
  `req.ip` is already the real socket address for both rate limiting and geo enrichment. Don't
  set `trust proxy: true` (blindly trusts `X-Forwarded-For` from anyone) on the off chance this
  ever runs behind something; if that ever happens, set the specific hop count instead.
- Never log the `Authorization` header or the raw JWT anywhere — request logging middleware, if
  added, must redact it. Ties to shared requirement #6 (secrets clean, never logged).

## 8. Dynamic submission validation

`widgets.fields` is a per-widget, customer-defined jsonb array (`[{ name, type, label,
required, maxLength }]`), so the submission payload can't be validated against one fixed Zod
schema at compile time. Build the schema at request time:

1. Look up the widget by `id` from the request (also gives you the server-derived `tenant_id`).
2. Map each field's `type` → a Zod validator (`text` → `z.string().max(maxLength)`, `email` →
   `z.string().email()`, `textarea` → `z.string().max(...)`, `checkbox` → `z.boolean()`).
3. Assemble with `z.object({...}).strict()` — unknown keys reject with 400, not silently drop.
4. Enforce a max field count at **widget creation** time (e.g. 20), so a malicious widget config
   can't itself become a payload-size attack vector.
5. At widget-creation time, validate each `fields[].name` against `^[a-zA-Z0-9_]{1,64}$` and
   reject `__proto__`, `constructor`, `prototype` outright — these names become both Zod schema
   keys and object keys when the payload is assembled, and they're tenant-supplied. Same
   creation-time pass caps `title`/`description`/`button_text` length — the per-field `maxLength`
   in §8 covers submission _values_, not the widget's own metadata.

Honeypot: add one extra field (e.g. `_hp`) to the assembled schema, always optional, never shown
to real visitors by the widget script. If it arrives non-empty: return 2xx, **do not** store a
row, do not fire the side effect. The `console.warn` line (`spam_dropped widget=<id> ip=<ip>`) is
server-side only — the caller never sees it — so it's fine for your own dev visibility, but don't
use it as the EVIDENCE.md proof: paste a `SELECT count(*) FROM submissions WHERE widget_id = $1`
before and after the honeypot curl instead. An unchanged count is harder to argue with than a log
line, and it's what "silently dropped" (Probe 6) actually means from the outside. That's why
`is_spam` isn't a column — a dropped submission never reaches the table it would live in. If
you'd rather keep a queryable spam count for the dashboard later, store it with a `status` enum
(`stored` / `spam_dropped`) instead of a boolean — but decide before you start pasting evidence,
not after.

## 9. Enrichment — synchronous, inline, with fallback

```
tryGeoProvider(ip, "ip-api.com", timeout=1500ms)
  → fail → tryGeoProvider(ip, "ipapi.co", timeout=1500ms)
    → fail → store submission with geo fields null
```

- **Mock mode (required by the brief's ground rules, not optional):** `GEO_MOCK=true` env flag
  switches both providers to local functions, each independently toggled down via its own env
  var — `GEO_MOCK_A_DOWN=true` and `GEO_MOCK_B_DOWN=true`. Probe 4 needs both halves proven:
  disable A alone → B answers; disable both → stored with no geo. A single toggle only covers
  the first half.
- In-memory per-IP cache (few-minute TTL) in front of both providers — a Probe 3 burst plus
  normal dev iteration will otherwise burn through ip-api.com's 45 req/min or ipapi.co's
  ~1,000/day limit and leave you with null-geo rows that muddy your own evidence.
- Real APIs are for manual dev spot-checks only, per the brief.

## 10. Safe side effect — Inngest (reuses BE-06/BE-09 pattern)

Submission is stored, then `inngest.send()` is awaited inside try/catch _before_ the response is
returned — the await here is only the network call to enqueue the event (fast), not the
background function itself. A failure to enqueue is caught, logged, and does not change the
response; it never delays it by more than that one send call. The background function that
actually sends the confirmation email/webhook runs after the response, out of the request path:

- The `run:` command (and `docker-compose.yml`) must start the Inngest Dev Server
  (`npx inngest-cli dev -u http://localhost:4000/api/inngest --no-discovery`) alongside the API,
  and the API must mount `serve()` from `inngest/express` at that path — without both, the
  evaluator's environment never delivers events to the function and shared requirement #3
  (background job with retries) is unproven, even though Probe 5 would still pass by accident
  (a connection failure gets caught same as any other enqueue failure).
- Function config sets `retries: 3` and an `onFailure` handler that writes to `side_effect_log`
  (same pattern as BE-06) — this is what actually demonstrates "retries + failure alert," not
  just the try/catch around `send()`.
- An `EMAIL_FAIL=true` env flag forces the side-effect function to throw deterministically, same
  role as `GEO_MOCK` for the geo chain — Probe 5 needs a repeatable way to force the failure, not
  a hope that Mailpit/console-log happens to break.
- `side_effect_log(submission_id)` gets an index — it's the table EVIDENCE.md queries directly.
- **Idempotent replay never re-fires the event.** If `POST /api/submissions` hits the
  `(widget_id, idempotency_key)` unique constraint, the handler returns the existing row's
  response immediately and skips both the insert _and_ the event send. This check has to come
  before the event-send call — otherwise a retried request stores nothing new but still
  enqueues a second event for the same submission.
- **Event dedup is Inngest's job, not a DB check.** Send the event with `id: submission.id`
  (Inngest dedupes events by id within its dedup window) so even a bug that does fire twice
  collapses to one function run. A `side_effect_log` row checked before sending, inside the
  function, is a weaker guard on its own — two concurrent runs can both pass the check before
  either has written success — so treat native event dedup as the real guard and the log as a
  backstop, not the other way around.
- Wrap the event send itself in try/catch — a failure to _enqueue_ the event logs to
  `side_effect_log` and still lets the request return success, same as a failure _inside_ the
  function.
- A hard failure (all retries exhausted) is logged to `side_effect_log` with the error and never
  reaches the visitor. This table isn't required by the brief — a `console.error` line would
  technically satisfy Probe 5 — but it's one small table that also gives EVIDENCE.md a clean
  `SELECT * FROM side_effect_log WHERE submission_id = $1` instead of a log-grep, which is worth
  the schema for a portfolio piece.

## 11. Widget script (vanilla JS) — behavior

1. Reads its own `<script src="...widget.v{N}.js?id=abc123">` tag, extracts `id`.
2. Fetches `GET /api/widgets/:id/config`.
3. Renders form into a `<div>` via DOM APIs — no framework, no build step on the customer's page.
   `createElement`/`textContent` only, **never** `innerHTML` for any config-sourced string
   (`title`, `description`, `button_text`, field `label`). The config is owner-controlled but
   rendered on a page the widget owner doesn't control — a malicious or compromised tenant
   account turns an `innerHTML` render into stored XSS against every one of that widget's
   customer sites.
4. Includes the honeypot field (§8), hidden via CSS, never labeled, never focusable
   (`tabindex="-1"`, `aria-hidden="true"`) — a real screen-reader user shouldn't stumble into it.
5. Generates a UUID client-side when the submit handler first fires, holds it in memory, and
   reuses it as `Idempotency-Key` on any retry of that same attempt (network failure, double
   submit) — a new UUID is only generated after a successful submit or a fresh form fill.
   Generating a new UUID on every click would defeat idempotency, not provide it.
6. On submit → `POST /api/submissions`.

## 12. Widget delivery & caching

Two different "version" concepts, kept separate on purpose:

- **Bundle version** — global, manual, no build step. Bump an integer in code when `widget.js`
  changes; it's served at `/widget.v{N}.js` with `Cache-Control: public, max-age=31536000,
immutable`. Every version's file is kept — `widget-script/dist/widget.v{N}.js`, one per bump,
  never overwritten or deleted (they're small text files; this is cheap). That retention is what
  makes "old embed snippets keep pointing at the old N until the customer re-copies the snippet"
  actually true rather than aspirational — an immutable URL that later 404s because the file was
  replaced isn't graceful versioning, it's a regression for every site that already pasted the
  old snippet.
- **Config version** — `widgets.config_version`, per-widget, incremented by `PATCH
/api/widgets/:id` on any field/settings edit (a no-op PATCH that changes nothing does not bump
  it). Used as the `ETag` on `GET /api/widgets/:id/config`, served with `Cache-Control: public,
max-age=30`; the handler compares `If-None-Match` against the current `config_version` and
  returns `304` on a match. Not required by the brief (only the `Cache-Control` header is), but
  cheap given the ETag already exists. This is deliberately a short-TTL polling cache, not a versioned/immutable one like
  the bundle — the config is _supposed_ to change without the customer touching their site again.
  Pinning a config version into the embed snippet (mirroring the bundle) would mean re-copying
  the snippet after every widget edit, which defeats the "paste once, manage from the dashboard"
  model this whole product category (Intercom, Mailchimp, HubSpot) is built on. The tradeoff: up
  to ~30s of staleness for a visitor whose browser cached the config just before an edit —
  acceptable for a lead-capture form, and shorter than most CDNs' default browser-cache TTLs.

## 13. Repo structure

```
flyrank-capstone-widgetplatform/
├── docker-compose.yml           # postgres — the only real infra dependency
├── api/
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   │   ├── pool.js
│   │   │   └── seed.js
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js
│   │   │   ├── cors.middleware.js
│   │   │   ├── rateLimit.middleware.js
│   │   │   ├── bodyLimit.js
│   │   │   └── errorHandler.js
│   │   ├── modules/
│   │   │   ├── widgets/
│   │   │   │   ├── widgets.routes.js
│   │   │   │   ├── widgets.controller.js
│   │   │   │   ├── widgets.service.js
│   │   │   │   ├── widgets.repository.js
│   │   │   │   └── widgets.schema.js
│   │   │   ├── submissions/        # same layering, + dynamic schema builder (§8)
│   │   │   └── dashboard/          # same layering, read-only aggregation queries
│   │   ├── services/
│   │   │   └── geo/                # cross-cutting, not a tenant resource — not a "module"
│   │   │       ├── geoClient.js    # real fallback chain
│   │   │       └── geoMock.js      # GEO_MOCK toggle (§9)
│   │   ├── inngest/                # client + functions
│   │   ├── widget-script/          # source for widget.js, statically served — no bundler needed
│   │   │   └── dist/                # widget.v1.js, widget.v2.js, ... — every version retained
│   │   ├── app.js
│   │   └── server.js
│   ├── migrations/                 # single home for SQL migrations — not also under src/db/
│   ├── .env.example
│   └── package.json
├── dashboard/                      # Next.js owner app
│   └── .env.example                # NEXT_PUBLIC_API_BASE_URL, Supabase anon key, etc.
├── test-site/                      # plain HTML "customer site", second origin
│   └── index.html
├── README.md
├── DESIGN.md
├── capstone.yaml
├── EVIDENCE.md
├── BUILDLOG.md
├── LICENSE                         # MIT
└── .gitignore
```

`modules/widgets/` reuses the repository/service/routes split from BE-02 — same pattern, just
formalized per module with a dedicated file per layer instead of one file per concern folder.

## 14. capstone.yaml (shape, not final content)

```yaml
run: docker compose up -d && npx inngest-cli dev -u http://localhost:4000/api/inngest --no-discovery & (cd api && npm install && npm run migrate && npm run dev)
seed: (cd api && npm run seed)
# test: omit entirely if no automated suite — it's optional per the brief
base_url: http://localhost:4000
endpoints:
  - GET  /api/widgets # auth required
  - POST /api/widgets # auth required
  - GET  /api/widgets/:id/embed # auth required
  - GET  /api/widgets/:id/submissions # auth required
  - GET  /api/dashboard/stats # auth required
  - GET  /api/widgets/:id/config # public, CORS
  - GET  /widget.v{N}.js # public, CORS
  - POST /api/submissions # public, CORS
```

Dashboard runs separately (`cd dashboard && npm install && npm run dev`) — document both
commands plainly in README rather than forcing a single-process launcher; that's more complexity
than a two-line README section buys you. Runtime pins: **Node 20 LTS, Postgres 16** (already the
BE-04 default), **Zod v3** (v3 syntax throughout this doc — `z.string().email()`, not v4's
`z.email()`; pin the exact version in `package.json` so a fresh `npm install` doesn't silently
land on v4). Migrations run via `node-pg-migrate` — pick one tool now rather than mixing raw
`psql -f` scripts with a runner later. Express 5 changes wildcard-route syntax (`*` alone no
longer matches everything — use a named wildcard or a catch-all middleware with no path instead)
if a literal `app.get('*', ...)` shows up anywhere.

## 15. Practical implementation order

No rigid per-stage verification table — build in dependency order, commit as you go with normal
conventional messages (`feat:`, `fix:`, `chore:`, `docs:`), and append real command output to
EVIDENCE.md right after each requirement works, not in one pass at the end. Each requirement in
§6 gets exactly one proof in EVIDENCE.md — a curl transcript, a query result, or a test pass —
pasted the moment it's true, not reconstructed later. The brief names three checkpoints
explicitly; all three still apply:

**Foundation** — repo public + LICENSE + `.gitignore` + README skeleton + `capstone.yaml` stub →
DESIGN.md committed.
→ **Brief gate: the design document is committed to the repository.**
→ `docker compose up` running Postgres → migrations + `seed.js` → Supabase auth middleware +
tenant upsert → widget CRUD, tenant-scoped → embed endpoint.

**Hardened submission path** — dynamic Zod validation, body limit + error mapping, idempotency
key, CORS + preflight on Path C → rate limiting + honeypot → geo fallback chain + mock mode →
Inngest side effect + idempotency guard.
→ **Brief gate: a cross-origin curl stores an enriched row.**

**Delivery, dashboard & proof** — versioned bundle + cached config endpoint → test-site renders
the widget from a second origin → submissions list + dashboard stats **API** → README +
EVIDENCE.md + BUILDLOG.md finalized, all 6 acceptance probes pasted. **Next.js dashboard UI is
last, and optional against the time budget** — none of the six Probes in the brief's §13 require
it running; they check the API directly. §5 of the brief says "endpoints + a simple table are
enough — this is a backend capstone, not a frontend one." Build it if the 35-50h budget allows
after everything else is proven; if not, a `curl`'d dashboard API response is a complete,
passing capstone on its own.
→ **Brief gate: widget renders on a second-origin page.**

Shared requirement #7 (AI cost tracked, if used) is **N/A** — nothing in this system calls an
LLM at runtime. Say so explicitly in EVIDENCE.md rather than leaving the box unaddressed.

**Submit** — portal form, repo link + this doc as the overview.
