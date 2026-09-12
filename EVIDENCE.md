# EVIDENCE

Each requirement gets exactly one proof, taken from real runs (dev database; counts include
deliberate burst/honeypot traffic). `Authorization: Bearer <token>` is redacted everywhere —
raw JWTs are never committed. `Idempotency-Key` values below are the literal ones used.

Conventions: `$TOKEN` = owner A's token, `$TOKEN2` = second tenant's token, `$WIDGET` =
owner A's active widget `83cb350a-…` unless stated otherwise.

## Probe 1 — Dashboard API visible with seeded account

```
> npm run seed
seed ok email=evaluator@flyrank.test tenant_id=11bce576-… demo_widget_id=8a8b0da0-… widget_created=true
> npm run seed   (again)
seed ok email=evaluator@flyrank.test tenant_id=11bce576-… demo_widget_id=8a8b0da0-… widget_created=false

curl -X POST "https://<project>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <anon>" -H "Content-Type: application/json" \
  -d '{"email":"evaluator@flyrank.test","password":"<seed-password>"}'
# -> {"access_token":"<843-char JWT>", ...}

curl http://localhost:4000/api/me -H "Authorization: Bearer <token>"
# -> {"tenantId":"11bce576-…","supabaseUserId":"8f298341-…"}  (matches seed output)
```

## Probe 2 — Malformed / oversized input → 4xx

```
POST /api/submissions  {"widgetId":"…","data":{"email":"a@b.co","nope":"x"}}
# -> 400 {"error":{"code":"VALIDATION_ERROR","message":"Unrecognized key(s) in object: 'nope'"}}

POST /api/submissions  (no Idempotency-Key)
# -> 400 {"error":{"code":"VALIDATION_ERROR","message":"Missing or malformed Idempotency-Key"}}

POST /api/submissions  (empty body file — JSON syntax probe)
# -> 400 {"error":{"code":"VALIDATION_ERROR","message":"Malformed JSON body"}}

POST /api/submissions  (21026-byte body, Idempotency-Key 4444…4444)
# -> 413 {"error":{"code":"PAYLOAD_TOO_LARGE","message":"Body exceeds 20kb limit"}}
```

## Probe 3 — Rate-limit burst → 429, same error shape

```
65 rapid POSTs, unique keys:
# -> 429s: 5   201/200s: 60

POST /api/submissions (inside window)
# -> HTTP/1.1 429 Too Many Requests
#    RateLimit: limit=60, remaining=0, reset=33 / Retry-After: 33
#    {"error":{"code":"RATE_LIMITED","message":"Too many requests"}}
```

Burst run last per DESIGN §8 (same-IP window); 60s pause before later probes.

## Probe 4 — Geo fallback, both halves (`GEO_MOCK=true`)

```
A up:               POST -> row geo_country=Mockland-A  geo_city="Mock City A"  provider=mock-a
A down (A_DOWN=true): POST -> geo_country=Mockland-B  geo_city="Mock City B"  provider=mock-b
Both down:          POST -> geo_country=null geo_city=null provider=null
```

Each with a fresh key; `SELECT geo_country, geo_city, geo_provider_used` shown per row.

## Probe 5 — Side effect fails, retries exhaust, visitor unaffected

```
EMAIL_FAIL=true, fresh key cccc…ccc3:
POST /api/submissions
# -> 201 {"id":"11fee5b0-…", ...}   (visitor never sees the failure)

Inngest dashboard: run Retrying (~2 min, 3 retries) -> Failed, "EMAIL_FAIL forced failure".
API log shows the same throw from functions.js:28 on each attempt.

SELECT kind, status, error FROM side_effect_log WHERE submission_id = '11fee5b0-…';
# -> email | failed | EMAIL_FAIL forced failure
```

Success path for contrast: `POST` (key `ffffffff…f3`) → `201` → `email | sent`;
replay same key → `200` same id, `SELECT count(*) … = 1` (no re-fire).
Implementation note: Inngest v4 delivers the original event nested
(`event.data.event.data`) to `onFailure` — the handler reads both shapes.

## Probe 6 — Honeypot silently dropped (counts, not logs)

```
SELECT count(*) FROM submissions WHERE widget_id = '$WIDGET';   -- 1
POST {"email":"bot@evil.com","_hp":"filled"} (key 5555…5555)    -- 200 {"ok":true}
SELECT count(*) FROM submissions WHERE widget_id = '$WIDGET';   -- 1 (unchanged)
SELECT count(*) ... WHERE idempotency_key = '55555555-…';       -- 0 (never stored)
POST {"email":"real@x.com","_hp":""} (key 6666…6666)            -- 201 (empty hp stores)
```

## Tenant isolation — 404, never 403

```
GET /api/widgets/$WIDGET                  (owner A)  -> 200
GET /api/widgets/$WIDGET                  ($TOKEN2)  -> 404
GET /api/widgets/$WIDGET/submissions      ($TOKEN2)  -> 404
GET /api/dashboard/stats?widgetId=$WIDGET ($TOKEN2)  -> 404
(widget CRUD, submissions list, stats: every query scopes tenant_id in SQL)
```

## Soft delete keeps history

```
PATCH title -> config_version 1 -> 2 (any field edit bumps)
DELETE /api/widgets/$WIDGET -> 204; GET -> 404
SELECT id, title, config_version, deleted_at ... -> row present, deleted_at set
```

## Idempotency + server-derived tenancy

```
POST key 1111…1111 -> 201 id 47c4a4fc-…
POST same key+widget -> 200, same id; SELECT count(*) ... = 1
Row: tenant_id = 85615ed4-… (owner A's tenant from the widget lookup; body carries no tenant_id)
```

## Config / bundle caching + preflight

```
GET /api/widgets/$WIDGET/config            -> 200 ETag: "1", Cache-Control: public, max-age=30
GET .../config  If-None-Match: "1"         -> 304
Body has type/title/fields/button_text only (no tenant_id, no config_version)
GET /widget.v1.js                          -> 200 immutable (max-age=31536000), CORS *
GET /widget.v2.js                          -> 200 immutable, CORS * (3735 bytes; v1 retained, 3292 bytes)
OPTIONS /api/widgets/$WIDGET/config       -> 204 Allow-Headers: Content-Type, Idempotency-Key
OPTIONS /api/submissions                  -> 204 (same)
```

## Second origin (:5500, real browser)

`npx serve test-site -l 5500` → form renders from config; submit `evaluator@flyrank.test`
→ status line `Message sent. Thank you!`; Inngest `submission/created
external_id=61ba90e3-…` → `function.finished` in ~0.6s; dashboard run Completed 235ms;
`SELECT payload … WHERE id='61ba90e3-…'` → `{"email":"testuser1@gmail.com"} | mock-a`.

## Owner dashboard (:3000)

`GET /login` → 200 (title + Sign in + email input present). `GET /api/widgets` through
`rewrites()` unauthenticated → API's own `401` Express-shaped JSON (proxy proven).
Seed login → list via rewrite shows `Seeded Newsletter [signup]`; detail submissions page
queries through the same path. Wrong password → inline error, no crash; DevTools: no CORS
errors (same-origin by construction).

## Shared requirements

- **#3 background job with retries:** Probe 5 + Inngest Dev Server
  (`npx inngest-cli@latest dev -u http://localhost:4000/api/inngest --no-discovery`,
  `serve()` mounted at `/api/inngest`, `retries: 3`, event dedup `id: submission.id`).
- **#5 idempotency:** Probe "Idempotency" above; replay skips insert *and* event send.
- **#6 secrets clean:** `.env`/`dashboard/.env.local` gitignored and untracked;
  `Authorization` header is read for verification, never logged; error paths never echo
  tokens or keys; this file redacts all tokens.
- **#7 AI cost tracked:** N/A — no runtime path calls an LLM. Stated, not left blank.
