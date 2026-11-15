# SeatLock design

SeatLock keeps PostgreSQL as the source of truth. A membership stores the
denormalized hackathon id so `UNIQUE (hackathon_id, user_id)` prevents a person
joining two teams in one hackathon. The join transaction locks the team row
with `SELECT ... FOR UPDATE`, checks capacity and membership, inserts the
membership, increments the counter, and writes audit and outbox rows before
commit. This is intentionally easier to reason about than SERIALIZABLE with
retry loops: serializable isolation can reduce throughput and requires every
caller to correctly retry serialization failures.

`member_count` is checked against membership rows by a deferred constraint
trigger. A team is eligible only after it reaches `min_size`; `locked_in` is set
at the hackathon check-in cutoff, so teams may exist below minimum while they
are still recruiting but cannot be locked in incomplete.

Leader succession orders remaining members by `joined_at ASC, user_id ASC`.
The last departure soft-deletes the team, cancels requests, revokes invites,
and records one transactional audit event. The outbox sequence is monotonic
and is the source for SSE replay.

The 10-character Crockford code has 50 bits of search space before its checksum.
At 5 attempts/second per IP and 1000 independent IPs, exhaustive search takes
about 2.3 years in expectation; progressive database-backed lockouts make
distributed guessing materially slower. Codes are stored as HMAC digests, not
plaintext.
