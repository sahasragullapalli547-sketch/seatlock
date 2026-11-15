import { randomUUID } from "node:crypto";
import { joinTeam } from "../teams.js";
import { inTransaction, pool } from "./client.js";

export type RaceLabResult = {
  runId: string;
  timeline: Array<{ userNumber: number; status: number; message: string }>;
  winnerCount: number;
  conflictCount: number;
  memberCount: number;
  auditCount: number;
  invariantPassed: boolean;
};

export async function runRaceLab(): Promise<RaceLabResult> {
  const runId = randomUUID();
  const hackathonId = randomUUID();
  const teamId = randomUUID();
  const userIds = Array.from({ length: 51 }, () => randomUUID());

  await inTransaction(async (client) => {
    await client.query("INSERT INTO hackathons(id,name,min_size,max_size) VALUES($1,$2,1,2)", [hackathonId, `Race Lab ${runId}`]);
    await client.query("INSERT INTO users(id,email,password_hash) SELECT id,id || '@race-lab.local','sandbox' FROM unnest($1::uuid[]) id", [userIds]);
    await client.query("INSERT INTO teams(id,hackathon_id,name,min_size,max_size,member_count) VALUES($1,$2,$3,1,2,1)", [teamId, hackathonId, `Race Lab ${runId}`]);
    await client.query("INSERT INTO memberships(team_id,hackathon_id,user_id,role) VALUES($1,$2,$3,'leader')", [teamId, hackathonId, userIds[0]]);
  });

  const outcomes = await Promise.all(userIds.slice(1).map(async (userId, index) => {
    try {
      await joinTeam(userId, teamId);
      return { userNumber: index + 1, status: 200, message: "WINNER — seat claimed" };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return { userNumber: index + 1, status, message: status === 409 ? "CONFLICT — seat was already claimed" : "ERROR — request failed" };
    }
  }));
  const state = (await pool.query<{ member_count: number; audit_count: number }>(
    "SELECT member_count,(SELECT count(*)::int FROM audit_log WHERE team_id=$1 AND action='member.joined') audit_count FROM teams WHERE id=$1", [teamId]
  )).rows[0]!;
  const winnerCount = outcomes.filter((outcome) => outcome.status === 200).length;
  const conflictCount = outcomes.filter((outcome) => outcome.status === 409).length;

  await pool.query("DELETE FROM audit_log WHERE team_id=$1", [teamId]);
  await pool.query("DELETE FROM outbox WHERE aggregate_id=$1", [teamId]);
  await pool.query("DELETE FROM memberships WHERE team_id=$1", [teamId]);
  await pool.query("DELETE FROM teams WHERE id=$1", [teamId]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [userIds]);
  await pool.query("DELETE FROM hackathons WHERE id=$1", [hackathonId]);

  return {
    runId,
    timeline: outcomes,
    winnerCount,
    conflictCount,
    memberCount: state.member_count,
    auditCount: state.audit_count,
    invariantPassed: winnerCount === 1 && conflictCount === 49 && state.member_count === 2 && state.audit_count === 1
  };
}
