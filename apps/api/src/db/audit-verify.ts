import crypto from "node:crypto";
import { pool } from "./client.js";

const rows = await pool.query<{ prev_hash: string; hash: string; ts: Date; actor_id: string | null; action: string; team_id: string | null; target_user_id: string | null; payload: object }>(
  "SELECT prev_hash, hash, ts, actor_id, action, team_id, target_user_id, payload FROM audit_log ORDER BY id"
);
let previous = "GENESIS";
for (const row of rows.rows) {
  const canonical = JSON.stringify({ ts: row.ts.toISOString(), actor_id: row.actor_id, action: row.action, team_id: row.team_id, target_user_id: row.target_user_id, payload: row.payload });
  const expected = crypto.createHash("sha256").update(previous + canonical).digest("hex");
  if (row.prev_hash !== previous || row.hash !== expected) {
    console.error("Audit chain invalid");
    process.exitCode = 1;
    await pool.end();
    process.exit();
  }
  previous = row.hash;
}
await pool.end();
console.log(`Audit chain valid (${rows.rowCount} rows)`);
