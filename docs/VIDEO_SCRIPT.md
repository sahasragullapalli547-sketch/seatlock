# Four-minute walkthrough

**0:00–0:45 — Race Lab.** Start with a team showing one open seat, fire fifty
real concurrent requests, and show one 200, forty-nine 409 responses, and the
auditor result.

**0:45–1:45 — Database proof.** Open the schema and explain the denormalized
hackathon uniqueness constraint, row lock, deferred counter trigger, leader
index, audit hash chain, and outbox sequence.

**1:45–2:45 — Product flow.** Show the board, request-to-join flow, leader
decision, deterministic succession, and audit viewer.

**2:45–3:30 — Operations.** Run migrations, invariants, audit verification, and
the CI commands against PostgreSQL 16.

**3:30–4:30 — Trade-offs.** Explain PostgreSQL-only simplicity, row locks over
SERIALIZABLE retries, and SSE replay over WebSockets for this fan-out pattern.
