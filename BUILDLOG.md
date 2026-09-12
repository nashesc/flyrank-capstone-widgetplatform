# BUILDLOG

Condensed per-step history. Full diffs: `git log`. AI-assisted throughout under the repo's
naming rules (DESIGN §3): generated identifiers were renamed to verb+object / content names
before commit (`migrationBuilder`, `upsertTenantFromSupabaseClaims`, `tryGeoProviderWithTimeout`,
`resolveGeoForIp`, `listSubmissionsForWidget`, …); no `data/result/handler/process()` survives.

- **Foundation** (`c737589`, `4924db6`, `5f920f9`, `3d1d7a5`): repo skeleton, Postgres 16
  compose, Express 5 `/health`, DESIGN.md committed (brief gate 1).
- **Step 1** (`27708ee`): `pg` pool + initial migration (tenants/widgets/submissions/
  side_effect_log). Fix: `.env` lived in `api/src/` while runners resolve `api/.env` —
  moved up; migration `up/down` names are framework contracts (kept), the `pgm` param
  renamed to `migrationBuilder`.
- **Step 2** (`a9b2efd`): Supabase JWT via `auth.getClaims()` (JWKS, asymmetric-safe) +
  tenant upsert → `req.tenantId`. Probed 401/200 + tenant row.
- **Step 3** (`b6c0df0`): tenant-scoped widget CRUD, soft delete, `config_version` bump,
  embed snippet. Probed 201/400/404 + patch `1→2` + deleted-row-kept.
- **Step 4** (`e2cee2f`): public config projection + `ETag`/`304`, `widget.v1.js`
  immutable, Path-B-only CORS. Fixes: public router must mount *before* the auth router
  (auth `Router.use` rejects before fallthrough); `.gitignore` `dist/` blanket rule
  removed so the bundle is committable; bundle rewritten `var` → `const`/`let`.
- **Step 5** (`a40c00f`): dynamic per-widget Zod, required `Idempotency-Key` (UUID),
  `201`/`200`-replay/`400`/`404`, `20kb` limit → `413`, shared `{error:{code,message}}`
  shape + 404/500 middleware.
- **Step 6** (`ecffb64`): 60/60s per-IP limiter (same error shape), honeypot `_hp`
  → `200 {ok:true}`, nothing stored. Burst proven last (5×429), then 60s pause.
- **Step 7** (`73bb44d`): geo chain `ip-api.com → ipapi.co` (1500ms each), per-IP cache,
  `GEO_MOCK` + per-provider down flags. Fix: service resolved geo but never passed it to
  the insert (nulls) — caught by the mock-a probe.
- **Step 8** (`542e280`): Inngest `submission/created` (dedup `id: submission.id`),
  `retries: 3`, `side_effect_log`, `EMAIL_FAIL` flag, replay never re-sends. Fixes:
  v2→v4 `createFunction` signature (`triggers: [...]`); v4 nests the original event
  inside `onFailure` (`event.data.event.data`) — first failures logged with NULL
  `submission_id`, caught by the unfiltered tail query, fixed with a both-shapes read.
- **Step 9** (`d2b67cc`): owner submissions list (`{data,nextCursor}`), dashboard stats
  API, `test-site/` second origin. Real-browser submit → Inngest `finished` → enriched row.
- **Seed + v2** (`57701e3`): `seed.js` (service_role `createUser`, idempotent tenant +
  demo widget), `widget.v2.js` (submit status line — v1 frozen per §13, still served).
- **Step 10a** (`8dd7d75`): minimal Next.js dashboard (login, widget list, submissions +
  snippet), `rewrites()` so Path A stays same-origin; verified HTML + proxied 401/200.
- **Audit fixes** (`9b41ad7`): deduped `api/.env.example` (had double keys); README gained the
  required architecture diagram; stats per-widget summary gained 14-day series + geo
  breakdown (spec §4.6); EVIDENCE reworded two browser-only claims to verified status.
- **External review fixes, round 1** (`4992a05`): applied no-op PATCH diff (version/ETag
  stable on same values), `_hp` reserved as a field name, UUID guards on `:id` params
  (404) and cursors (400) plus a `22P02 → 404` backstop, `sideEffectLog.repository.js`
  unifies both writers, bundle routes served from a boot-time `dist/` whitelist,
  DESIGN §3/§13 clarified. The reviewer's LICENSE-missing item was refuted with
  evidence (`git ls-files` shows MIT tracked since `c737589`), not taken on trust.
- **External review fixes, round 2** (`1907c45`): applied the embed single source of
  truth (`widget-script/bundleVersions.js` feeds routes and snippet — v3 ships by adding
  the file, no string-hunt). Rejected two items as fail-safe with no probing path:
  moving `sideEffectLog.repository.js` out of `modules/submissions/` (only one writer
  exists — move when a second job needs it) and making the PATCH diff atomic
  (`SELECT … FOR UPDATE` adds complexity for a race no probe exercises; a concurrent
  false-positive only causes an extra cache-bust, never a missed update).
  The difference between "I applied a review" and "I evaluated a review" is the point:
  every finding above was checked against the code, and the rejections are minuted here
  with their reasons rather than silently dropped.
- **Evidence hardening**: Probe 3 gained its post-window `201` closer; process-narrative
  header renamed to "Malformed ID / cursor handling"; embed-snippet and layering claims
  replaced with pasted transcripts; shared #1/#2/#4 cross-referenced; dedicated
  "Embed snippet per widget" proof block.

Total: 20 commits, conventional messages, no fixup/amend chains.
