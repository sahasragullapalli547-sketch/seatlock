import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import crypto from "node:crypto";
import { z } from "zod";
import { inTransaction, pool } from "./db/client.js";
import { runRaceLab } from "./db/race-lab.js";
import { createTeam, decideJoinRequest, joinTeamInClient, leaveTeam, requestToJoin } from "./teams.js";
import { authenticatedUser, login, register } from "./auth.js";
import { issueInvite, redeemInvite } from "./invites.js";
const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });
await app.register(helmet);
await app.register(cors, { origin: true, credentials: true });
const id = z.string().uuid();
const metrics = { requests: 0, conflicts: 0, rateLimited: 0, sseConnections: 0 };
const attempts = new Map();
function actor(request) { return authenticatedUser(request); }
function rateLimit(request) {
    const now = Date.now();
    const current = attempts.get(request.ip);
    if (!current || current.reset < now) {
        attempts.set(request.ip, { count: 1, reset: now + 60_000 });
        return;
    }
    current.count += 1;
    if (current.count > 120) {
        metrics.rateLimited += 1;
        throw Object.assign(new Error("Too many requests"), { statusCode: 429 });
    }
}
app.get("/healthz", async () => ({ status: "ok" }));
app.get("/metrics", async () => [
    "# TYPE seatlock_http_requests_total counter", `seatlock_http_requests_total ${metrics.requests}`,
    "# TYPE seatlock_conflicts_total counter", `seatlock_conflicts_total ${metrics.conflicts}`,
    "# TYPE seatlock_rate_limit_hits_total counter", `seatlock_rate_limit_hits_total ${metrics.rateLimited}`,
    "# TYPE seatlock_sse_connections gauge", `seatlock_sse_connections ${metrics.sseConnections}`
].join("\n") + "\n");
app.post("/auth/register", async (request, reply) => {
    try {
        return reply.code(201).send(await register(request.body));
    }
    catch (error) {
        return reply.code(error.statusCode ?? 422).send({ error: error instanceof Error ? error.message : "Registration failed" });
    }
});
app.post("/auth/login", async (request, reply) => {
    try {
        return reply.send(await login(request.body));
    }
    catch (error) {
        return reply.code(error.statusCode ?? 401).send({ error: error instanceof Error ? error.message : "Login failed" });
    }
});
app.get("/readyz", async (_request, reply) => {
    try {
        await pool.query("SELECT 1");
        return { status: "ready" };
    }
    catch {
        return reply.code(503).send({ status: "not_ready" });
    }
});
app.get("/demo/config", async (_request, reply) => {
    const result = await pool.query(`SELECT h.id AS hackathon_id,t.id AS team_id,u.id AS user_id,leader.id AS leader_id
     FROM hackathons h
     JOIN teams t ON t.hackathon_id=h.id AND t.name='Demo team' AND t.deleted_at IS NULL
     JOIN users u ON u.email LIKE 'seed-%@seatlock.local'
     JOIN users leader ON leader.email='seed-0@seatlock.local'
     WHERE u.id <> leader.id
       AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.hackathon_id=h.id)
       AND NOT EXISTS (SELECT 1 FROM join_requests r WHERE r.user_id=u.id AND r.status='pending' AND r.team_id=t.id)
     ORDER BY h.created_at,u.email LIMIT 1`);
    const config = result.rows[0];
    if (!config)
        return reply.code(404).send({ error: "Run npm run seed first" });
    return config;
});
app.get("/demo/team/:teamId", async (request, reply) => {
    const teamId = id.safeParse(request.params.teamId);
    if (!teamId.success)
        return reply.code(400).send({ error: "Invalid team id" });
    const team = (await pool.query("SELECT id,name,member_count,max_size,min_size,locked_in,version FROM teams WHERE id=$1 AND deleted_at IS NULL", [teamId.data])).rows[0];
    if (!team)
        return reply.code(404).send({ error: "Team not found" });
    const members = (await pool.query("SELECT m.user_id,m.role,m.joined_at,u.email,u.skills,u.tz_offset_minutes FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 ORDER BY m.joined_at", [teamId.data])).rows;
    const requests = (await pool.query("SELECT r.id,r.user_id,r.created_at,u.email,u.skills FROM join_requests r JOIN users u ON u.id=r.user_id WHERE r.team_id=$1 AND r.status='pending' ORDER BY r.created_at", [teamId.data])).rows;
    return { team, members, requests };
});
app.post("/demo/race", async (request, reply) => {
    try {
        return await runRaceLab();
    }
    catch (error) {
        request.log.error(error);
        return reply.code(500).send({ error: "Race Lab failed" });
    }
});
app.post("/teams", async (request, reply) => {
    try {
        const userId = actor(request);
        const parsed = z.object({ hackathonId: id, name: z.string().trim().min(1).max(100) }).safeParse(request.body);
        if (!parsed.success)
            return reply.code(422).send({ error: "Invalid request" });
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key.length < 8 || key.length > 200)
            return reply.code(400).send({ error: "Idempotency-Key required" });
        const response = await createTeam(userId, parsed.data.hackathonId, parsed.data.name);
        return reply.code(201).send(response);
    }
    catch (error) {
        return reply.code(error.statusCode ?? 500).send({ error: error instanceof Error ? error.message : "Request failed" });
    }
});
app.post("/teams/:teamId/join", async (request, reply) => {
    try {
        metrics.requests += 1;
        rateLimit(request);
        const userId = actor(request);
        const teamId = id.parse(request.params.teamId);
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key.length < 8 || key.length > 200)
            return reply.code(400).send({ error: "Idempotency-Key required" });
        const bodyHash = crypto.createHash("sha256").update(JSON.stringify({ teamId })).digest("hex");
        const outcome = await inTransaction(async (client) => {
            await client.query("INSERT INTO idempotency_keys(key,user_id,request_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [key, userId, bodyHash]);
            const claim = (await client.query("SELECT request_hash,status,response FROM idempotency_keys WHERE key=$1 AND user_id=$2 FOR UPDATE", [key, userId])).rows[0];
            if (claim.request_hash !== bodyHash)
                return { status: 422, response: { error: "Idempotency key was reused with a different request" }, replay: false };
            if (claim.status !== null && claim.response)
                return { status: claim.status, response: claim.response, replay: true };
            try {
                const response = await joinTeamInClient(client, userId, teamId);
                await client.query("UPDATE idempotency_keys SET status=200,response=$3 WHERE key=$1 AND user_id=$2", [key, userId, response]);
                return { status: 200, response, replay: false };
            }
            catch (error) {
                const status = error.statusCode ?? 500;
                if (status === 409)
                    metrics.conflicts += 1;
                const response = { error: error instanceof Error ? error.message : "Request failed" };
                await client.query("UPDATE idempotency_keys SET status=$3,response=$4 WHERE key=$1 AND user_id=$2", [key, userId, status, response]);
                return { status, response, replay: false };
            }
        });
        return reply.header(outcome.replay ? "Idempotent-Replay" : "x-seatlock-idempotency", outcome.replay ? "true" : "stored").code(outcome.status).send(outcome.response);
    }
    catch (error) {
        return reply.code(error.statusCode ?? 400).send({ error: error instanceof Error ? error.message : "Invalid request" });
    }
});
app.post("/teams/:teamId/requests", async (request, reply) => {
    try {
        const userId = actor(request);
        const teamId = id.parse(request.params.teamId);
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key.length < 8)
            return reply.code(400).send({ error: "Idempotency-Key required" });
        return reply.code(201).send(await requestToJoin(userId, teamId));
    }
    catch (error) {
        return reply.code(error.statusCode ?? 500).send({ error: error instanceof Error ? error.message : "Request failed" });
    }
});
app.post("/teams/:teamId/invites", async (request, reply) => {
    try {
        const body = z.object({ maxUses: z.number().int().positive().nullable().default(null) }).parse(request.body);
        return reply.code(201).send(await issueInvite(actor(request), id.parse(request.params.teamId), body.maxUses));
    }
    catch (error) {
        return reply.code(error.statusCode ?? 422).send({ error: error instanceof Error ? error.message : "Invite failed" });
    }
});
app.post("/invites/redeem", async (request, reply) => {
    try {
        const body = z.object({ code: z.string().trim().toUpperCase() }).parse(request.body);
        rateLimit(request);
        return reply.send(await redeemInvite(actor(request), body.code));
    }
    catch (error) {
        request.log.warn({ error }, "invite redemption rejected");
        return reply.code(error.statusCode ?? 404).send({ error: "Invite is unavailable" });
    }
});
app.post("/join-requests/:requestId/decision", async (request, reply) => {
    try {
        const accepted = z.object({ accept: z.boolean() }).parse(request.body);
        const result = await decideJoinRequest(actor(request), id.parse(request.params.requestId), accepted.accept);
        return reply.send(result);
    }
    catch (error) {
        return reply.code(error.statusCode ?? 422).send({ error: error instanceof Error ? error.message : "Request failed" });
    }
});
app.post("/teams/:teamId/leave", async (request, reply) => {
    try {
        await leaveTeam(actor(request), id.parse(request.params.teamId));
        return reply.code(204).send();
    }
    catch (error) {
        return reply.code(error.statusCode ?? 500).send({ error: error instanceof Error ? error.message : "Request failed" });
    }
});
app.get("/teams/:teamId/audit", async (request, reply) => {
    try {
        const userId = actor(request);
        const teamId = id.parse(request.params.teamId);
        const member = await pool.query("SELECT 1 FROM memberships WHERE team_id=$1 AND user_id=$2", [teamId, userId]);
        if (!member.rowCount)
            return reply.code(403).send({ error: "Team membership required" });
        const result = await pool.query("SELECT id,ts,actor_id,action,team_id,target_user_id,payload,prev_hash,hash FROM audit_log WHERE team_id=$1 ORDER BY id", [teamId]);
        return result.rows;
    }
    catch (error) {
        return reply.code(error.statusCode ?? 400).send({ error: error instanceof Error ? error.message : "Invalid request" });
    }
});
app.get("/teams/:teamId/suggestions", async (request, reply) => {
    try {
        const userId = actor(request);
        const teamId = id.parse(request.params.teamId);
        const result = await pool.query(`WITH team_users AS (SELECT user_id FROM memberships WHERE team_id=$1),
       team_skills AS (SELECT DISTINCT jsonb_array_elements_text(u.skills) skill FROM users u JOIN team_users t ON t.user_id=u.id)
       SELECT u.id,u.email,u.skills,u.tz_offset_minutes,
         CASE WHEN EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id) THEN 0 ELSE 100 END AS fit_score,
         CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(u.skills) s WHERE NOT EXISTS (SELECT 1 FROM team_skills t WHERE t.skill=s)) THEN 100 ELSE 35 END AS skill_score,
         100 AS timezone_score
       FROM users u WHERE u.id<>$2 AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id)
       ORDER BY fit_score DESC,skill_score DESC,u.id LIMIT 20`, [teamId, userId]);
        return { weights: { skill_complement: 0.5, timezone_overlap: 0.35, availability_fit: 0.15 }, candidates: result.rows.map((row) => ({ ...row, score: Math.round(row.skill_score * 0.5 + row.timezone_score * 0.35 + row.fit_score * 0.15), explanation: `Potential skill complement for ${row.email}` })) };
    }
    catch (error) {
        return reply.code(error.statusCode ?? 400).send({ error: error instanceof Error ? error.message : "Invalid request" });
    }
});
app.get("/events/board", async (request, reply) => {
    reply.hijack();
    metrics.sseConnections += 1;
    const response = reply.raw;
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const lastId = Number(request.headers["last-event-id"] ?? 0);
    const rows = await pool.query("SELECT sequence,payload FROM outbox WHERE sequence>$1 ORDER BY sequence LIMIT 100", [lastId]);
    for (const row of rows.rows)
        response.write(`id: ${row.sequence}\ndata: ${JSON.stringify(row.payload)}\n\n`);
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15000);
    request.raw.on("close", () => { clearInterval(heartbeat); metrics.sseConnections -= 1; });
});
app.get("/events/teams/:teamId", async (request, reply) => {
    const userId = actor(request);
    const teamId = id.parse(request.params.teamId);
    const member = await pool.query("SELECT 1 FROM memberships WHERE team_id=$1 AND user_id=$2", [teamId, userId]);
    if (!member.rowCount)
        return reply.code(403).send({ error: "Team membership required" });
    reply.hijack();
    metrics.sseConnections += 1;
    const response = reply.raw;
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const lastId = Number(request.headers["last-event-id"] ?? 0);
    const rows = await pool.query("SELECT sequence,payload FROM outbox WHERE aggregate_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100", [teamId, lastId]);
    for (const row of rows.rows)
        response.write(`id: ${row.sequence}\ndata: ${JSON.stringify(row.payload)}\n\n`);
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15000);
    request.raw.on("close", () => { clearInterval(heartbeat); metrics.sseConnections -= 1; });
});
app.get("/board", async (request, reply) => {
    const query = request.query;
    const hackathonId = id.safeParse(query.hackathonId);
    if (!hackathonId.success)
        return reply.code(400).send({ error: "hackathonId is required" });
    const result = await pool.query(`SELECT id,name,member_count,max_size,created_at
     FROM teams WHERE hackathon_id=$1 AND deleted_at IS NULL
     AND ($2::timestamptz IS NULL OR created_at < $2)
     AND member_count < max_size ORDER BY created_at DESC,id DESC LIMIT 50`, [hackathonId.data, query.cursor ?? null]);
    return { items: result.rows, nextCursor: result.rows.at(-1)?.created_at ?? null };
});
export { app };
if (process.env.NODE_ENV !== "test") {
    await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
}
