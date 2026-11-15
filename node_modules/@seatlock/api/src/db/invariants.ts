import { pool } from "./client.js";

const checks = {
  over_capacity: "SELECT count(*)::int AS count FROM teams WHERE member_count > max_size",
  duplicate_users: "SELECT count(*)::int AS count FROM (SELECT hackathon_id, user_id FROM memberships GROUP BY 1,2 HAVING count(*) > 1) x",
  wrong_counts: "SELECT count(*)::int AS count FROM teams t WHERE t.member_count <> (SELECT count(*) FROM memberships m WHERE m.team_id = t.id)",
  missing_leaders: "SELECT count(*)::int AS count FROM teams t WHERE t.deleted_at IS NULL AND t.member_count > 0 AND (SELECT count(*) FROM memberships m WHERE m.team_id = t.id AND m.role = 'leader') <> 1",
  orphan_teams: "SELECT count(*)::int AS count FROM teams t WHERE t.deleted_at IS NULL AND t.member_count = 0"
} as const;

const violations: Record<string, number> = {};
for (const [name, query] of Object.entries(checks)) {
  violations[name] = (await pool.query<{ count: number }>(query)).rows[0]?.count ?? 0;
}
await pool.end();
if (Object.values(violations).some((count) => count > 0)) {
  console.error(JSON.stringify(violations, null, 2));
  process.exitCode = 1;
} else {
  console.log("All invariants passed", JSON.stringify(violations));
}
