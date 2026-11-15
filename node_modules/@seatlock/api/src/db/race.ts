import { randomUUID } from "node:crypto";
import { joinTeam } from "../teams.js";
import { pool, inTransaction } from "./client.js";

const ids = Array.from({ length: 51 }, () => randomUUID());
const teamId = randomUUID();
const hackathonId = randomUUID();
await inTransaction(async (client) => {
  await client.query("INSERT INTO hackathons(id,name,min_size,max_size) VALUES($1,'Race Lab',1,2)", [hackathonId]);
  await client.query("INSERT INTO users(id,email,password_hash) SELECT id,id || '@race.local','test' FROM unnest($1::uuid[]) id", [ids]);
  await client.query("INSERT INTO teams(id,hackathon_id,name,min_size,max_size,member_count) VALUES($1,$2,'Last seat',1,2,1)", [teamId, hackathonId]);
  await client.query("INSERT INTO memberships(team_id,hackathon_id,user_id,role) VALUES($1,$2,$3,'leader')", [teamId, hackathonId, ids[0]]);
});
const barrier = new Promise<void>((resolve) => setTimeout(resolve, 50));
await barrier;
const results = await Promise.all(ids.slice(1).map(async (userId) => {
  try { await joinTeam(userId, teamId); return 200; } catch (error) { return (error as { statusCode?: number }).statusCode ?? 500; }
}));
const winners = results.filter((status) => status === 200).length;
const conflicts = results.filter((status) => status === 409).length;
const state = await pool.query<{ member_count: number; audit_count: number }>(
  "SELECT t.member_count,(SELECT count(*) FROM audit_log WHERE team_id=$1 AND action='member.joined')::int AS audit_count FROM teams t WHERE t.id=$1", [teamId]
);
await pool.query("DELETE FROM audit_log WHERE team_id=$1", [teamId]);
await pool.query("DELETE FROM outbox WHERE aggregate_id=$1", [teamId]);
await pool.query("DELETE FROM memberships WHERE team_id=$1", [teamId]);
await pool.query("DELETE FROM teams WHERE id=$1", [teamId]);
await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [ids]);
await pool.query("DELETE FROM hackathons WHERE id=$1", [hackathonId]);
await pool.end();
if (winners !== 1 || conflicts !== 49 || state.rows[0]?.member_count !== 2 || state.rows[0]?.audit_count !== 1) {
  throw new Error(`Race proof failed: winners=${winners}, conflicts=${conflicts}, state=${JSON.stringify(state.rows[0])}`);
}
console.log(`Race proof passed: ${winners} winner, ${conflicts} conflicts, member_count=2, one join audit`);
