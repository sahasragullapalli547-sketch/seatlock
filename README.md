# SeatLock

SeatLock is a race-proof hackathon team formation platform. It allows users to discover teams, request to join, accept invitations, manage memberships, and receive real-time updates.

The main goal of the project is to guarantee that team capacity remains correct even when many users try to join the same team simultaneously.

## Features

- Create and manage hackathon teams
- Request to join a team
- Accept or decline join requests
- Join teams using secure invitations
- Prevent users from joining multiple teams in one hackathon
- PostgreSQL row-level locking for concurrency safety
- Idempotent join operations
- JWT authentication
- Argon2id password hashing
- Real-time updates using Server-Sent Events
- Tamper-evident audit logs
- Transactional outbox events
- Leader succession when a leader leaves
- Team soft deletion when the last member leaves
- Rate limiting and API metrics
- Database invariant verification
- Race Lab for testing simultaneous join requests

## Technology Stack

- TypeScript
- Node.js
- Fastify
- PostgreSQL 16
- React
- Vite
- TanStack React Query
- Docker Compose
- Vitest
- Playwright

## Project Structure

```text
apps/api/       Backend API and database logic
apps/web/       React frontend
packages/shared Shared validation schemas and types
docs/           Design documents and architecture decisions
ops/            Load-testing scripts
