# PS1 implementation checklist

| Requirement | Implementation / proof |
|---|---|
| Capacity and one team per hackathon | `apps/api/src/db/schema.sql`, `teams.ts` |
| Last-seat race | `npm run race`, `db/race-lab.ts` |
| Idempotent join key | `server.ts` join route and `idempotency_keys` |
| Join requests and leader decisions | `teams.ts`, `/join-requests/:id/decision` |
| Leader succession and soft deletion | `teams.ts` leave transaction |
| Audit and invariants | `audit-verify.ts`, `invariants.ts` |
| Real-time board/team streams | `/events/board`, `/events/teams/:teamId` |
| Auth | `auth.ts`, `/auth/register`, `/auth/login` |
| Invite security | `invites.ts`, HMAC/checksum/expiry/max uses |
| Rate limiting and metrics | `server.ts`, `/metrics` |
| Seed and board load script | `db/seed.ts`, `ops/k6-board.js` |
| React phone/keyboard UI | `apps/web/src` |
| CI | `.github/workflows/ci.yml` |

Live deployment, Playwright/axe execution, k6 numbers, and kill-9 chaos results
require an external runner or deployment credentials and are not fabricated here.
