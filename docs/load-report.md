# Load report

The k6 scenario is in [`ops/k6-board.js`](../ops/k6-board.js). This run used
PostgreSQL 16 locally with 100 VUs for 30 seconds against the seeded board.

```powershell
k6 run -e API_URL=http://localhost:3000 -e HACKATHON_ID=<id> ops/k6-board.js
```

## Measured run

- Requests: 35,389
- Successful checks: 100%
- HTTP failures: 0%
- Throughput: 1,177 requests/second
- p95 latency: 110.95 ms
- Threshold: `p(95)<200 ms` — passed
