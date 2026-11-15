# ADR 002: PostgreSQL only

Use PostgreSQL for state, idempotency, events, and rate-limit counters. This
keeps deployment simple and avoids split-brain cache correctness problems.
