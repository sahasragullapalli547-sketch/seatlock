# ADR 001: Lock the team row

Use `SELECT ... FOR UPDATE` in the join transaction. It makes capacity and
membership decisions serialize on one database row. SERIALIZABLE with retries
would be valid but adds retry complexity and can reduce throughput.
