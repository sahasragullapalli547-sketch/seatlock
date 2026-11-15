# SeatLock

Race-proof hackathon team formation backed only by PostgreSQL 16.

## Quickstart

```powershell
npm install
docker compose up -d db
$env:DATABASE_URL="postgres://seatlock:seatlock@localhost:5432/seatlock"
$env:ALLOW_DEMO_AUTH="true"
npm run db:migrate
npm run seed
npm test
```

The join path locks a team row, updates capacity and membership in one
transaction, and commits its audit/outbox records atomically. Run
`npm run invariants` and `npm run audit:verify` against a running database.

For production, set `ALLOW_DEMO_AUTH=false` and use the Bearer token returned by
`POST /auth/register` or `POST /auth/login`.

## Proof commands

```powershell
npm run seed
npm run race
npm run invariants
npm run audit:verify
```

The race proof uses 50 concurrent PostgreSQL-backed callers against one final
seat and expects exactly one success and 49 clean conflicts.
