import crypto from "node:crypto";
import { inTransaction } from "./db/client.js";
function canonicalAudit(row) {
    return JSON.stringify({ ts: row.ts.toISOString(), actor_id: row.actorId, action: row.action, team_id: row.teamId, target_user_id: row.targetUserId, payload: row.payload });
}
async function audit(client, actorId, action, teamId, targetUserId, payload) {
    await client.query("SELECT pg_advisory_xact_lock(922337203685477000)");
    const previous = (await client.query("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")).rows[0]?.hash ?? "GENESIS";
    const ts = new Date();
    const hash = crypto.createHash("sha256").update(previous + canonicalAudit({ ts, actorId, action, teamId, targetUserId, payload })).digest("hex");
    await client.query("INSERT INTO audit_log(ts, actor_id, action, team_id, target_user_id, payload, prev_hash, hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [ts, actorId, action, teamId, targetUserId, payload, previous, hash]);
}
export async function requestToJoin(userId, teamId) {
    return inTransaction(async (client) => {
        const team = (await client.query("SELECT hackathon_id,deleted_at FROM teams WHERE id=$1 FOR UPDATE", [teamId])).rows[0];
        if (!team || team.deleted_at)
            throw Object.assign(new Error("Team is unavailable"), { statusCode: 404 });
        const existing = await client.query("SELECT 1 FROM memberships WHERE hackathon_id=$1 AND user_id=$2", [team.hackathon_id, userId]);
        if (existing.rowCount)
            throw Object.assign(new Error("Already in a team"), { statusCode: 409 });
        const request = (await client.query("INSERT INTO join_requests(team_id,user_id) VALUES($1,$2) RETURNING id", [teamId, userId])).rows[0];
        await audit(client, userId, "join.requested", teamId, userId, {});
        await client.query("INSERT INTO outbox(topic,aggregate_id,payload) VALUES('team.changed',$1,$2)", [teamId, { action: "join.requested", userId }]);
        return { requestId: request.id };
    });
}
export async function decideJoinRequest(actorId, requestId, accept) {
    return inTransaction(async (client) => {
        const request = (await client.query(`SELECT r.team_id,r.user_id,r.status,t.hackathon_id FROM join_requests r
       JOIN teams t ON t.id=r.team_id WHERE r.id=$1 FOR UPDATE OF r`, [requestId])).rows[0];
        if (!request || request.status !== "pending")
            throw Object.assign(new Error("Request is unavailable"), { statusCode: 404 });
        const leader = await client.query("SELECT 1 FROM memberships WHERE team_id=$1 AND user_id=$2 AND role='leader'", [request.team_id, actorId]);
        if (!leader.rowCount)
            throw Object.assign(new Error("Leader permission required"), { statusCode: 403 });
        if (!accept) {
            await client.query("UPDATE join_requests SET status='declined',decided_at=now() WHERE id=$1", [requestId]);
            await audit(client, actorId, "join.declined", request.team_id, request.user_id, {});
            return { teamId: request.team_id };
        }
        const team = (await client.query("SELECT member_count,max_size FROM teams WHERE id=$1 FOR UPDATE", [request.team_id])).rows[0];
        if (team.member_count >= team.max_size)
            throw Object.assign(new Error("Team is full"), { statusCode: 409 });
        const already = await client.query("SELECT 1 FROM memberships WHERE hackathon_id=$1 AND user_id=$2", [request.hackathon_id, request.user_id]);
        if (already.rowCount)
            throw Object.assign(new Error("Already in a team"), { statusCode: 409 });
        await client.query("INSERT INTO memberships(team_id,hackathon_id,user_id,role) VALUES($1,$2,$3,'member')", [request.team_id, request.hackathon_id, request.user_id]);
        const updated = (await client.query("UPDATE teams SET member_count=member_count+1,version=version+1 WHERE id=$1 RETURNING member_count", [request.team_id])).rows[0];
        await client.query("UPDATE join_requests SET status='accepted',decided_at=now() WHERE id=$1", [requestId]);
        await audit(client, actorId, "join.accepted", request.team_id, request.user_id, {});
        return { teamId: request.team_id, memberCount: updated.member_count };
    });
}
export async function joinTeam(userId, teamId) {
    return inTransaction(async (client) => {
        return joinTeamInClient(client, userId, teamId);
    });
}
export async function joinTeamInClient(client, userId, teamId) {
    const team = (await client.query("SELECT hackathon_id, member_count, max_size, deleted_at FROM teams WHERE id=$1 FOR UPDATE", [teamId])).rows[0];
    if (!team || team.deleted_at)
        throw Object.assign(new Error("Team is unavailable"), { statusCode: 404 });
    const existing = await client.query("SELECT 1 FROM memberships WHERE hackathon_id=$1 AND user_id=$2", [team.hackathon_id, userId]);
    if (existing.rowCount)
        throw Object.assign(new Error("Already in a team"), { statusCode: 409 });
    if (team.member_count >= team.max_size)
        throw Object.assign(new Error("Team is full"), { statusCode: 409 });
    await client.query("INSERT INTO memberships(team_id, hackathon_id, user_id, role) VALUES($1,$2,$3,'member')", [teamId, team.hackathon_id, userId]);
    const updated = (await client.query("UPDATE teams SET member_count=member_count+1, version=version+1 WHERE id=$1 RETURNING member_count", [teamId])).rows[0];
    await audit(client, userId, "member.joined", teamId, userId, {});
    await client.query("INSERT INTO outbox(topic, aggregate_id, payload) VALUES('team.changed',$1,$2)", [teamId, { action: "member.joined", userId }]);
    return { teamId, memberCount: updated.member_count };
}
export async function createTeam(userId, hackathonId, name) {
    return inTransaction(async (client) => {
        const hackathon = (await client.query("SELECT min_size,max_size FROM hackathons WHERE id=$1 FOR UPDATE", [hackathonId])).rows[0];
        if (!hackathon)
            throw Object.assign(new Error("Hackathon not found"), { statusCode: 404 });
        const team = (await client.query("INSERT INTO teams(hackathon_id,name,min_size,max_size,member_count) VALUES($1,$2,$3,$4,1) RETURNING id", [hackathonId, name, hackathon.min_size, hackathon.max_size])).rows[0];
        await client.query("INSERT INTO memberships(team_id,hackathon_id,user_id,role) VALUES($1,$2,$3,'leader')", [team.id, hackathonId, userId]);
        await audit(client, userId, "team.created", team.id, userId, { name });
        await client.query("INSERT INTO outbox(topic, aggregate_id, payload) VALUES('team.changed',$1,$2)", [team.id, { action: "team.created" }]);
        return { teamId: team.id };
    });
}
export async function leaveTeam(userId, teamId) {
    await inTransaction(async (client) => {
        const team = (await client.query("SELECT hackathon_id, member_count FROM teams WHERE id=$1 FOR UPDATE", [teamId])).rows[0];
        if (!team)
            throw Object.assign(new Error("Team not found"), { statusCode: 404 });
        const membership = (await client.query("SELECT role FROM memberships WHERE team_id=$1 AND user_id=$2", [teamId, userId])).rows[0];
        if (!membership)
            throw Object.assign(new Error("Membership not found"), { statusCode: 404 });
        await client.query("DELETE FROM memberships WHERE team_id=$1 AND user_id=$2", [teamId, userId]);
        if (team.member_count === 1) {
            await client.query("UPDATE teams SET member_count=0, version=version+1, deleted_at=now() WHERE id=$1", [teamId]);
            await client.query("UPDATE join_requests SET status='cancelled', decided_at=now() WHERE team_id=$1 AND status='pending'", [teamId]);
            await client.query("UPDATE invite_codes SET revoked_at=now() WHERE team_id=$1 AND revoked_at IS NULL", [teamId]);
            await audit(client, userId, "team.deleted", teamId, userId, { reason: "last_member_left" });
            return;
        }
        if (membership.role === "leader") {
            const successor = (await client.query("SELECT user_id FROM memberships WHERE team_id=$1 ORDER BY joined_at ASC, user_id ASC LIMIT 1", [teamId])).rows[0];
            await client.query("UPDATE memberships SET role='leader' WHERE team_id=$1 AND user_id=$2", [teamId, successor.user_id]);
            await audit(client, userId, "leader.succeeded", teamId, successor.user_id, {});
        }
        await client.query("UPDATE teams SET member_count=member_count-1, version=version+1 WHERE id=$1", [teamId]);
        await audit(client, userId, "member.left", teamId, userId, {});
    });
}
