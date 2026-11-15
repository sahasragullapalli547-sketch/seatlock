import { pool, inTransaction } from "./client.js";

await inTransaction(async (client) => {
  const hackathon = (await client.query<{ id: string }>(
    "INSERT INTO hackathons(name,min_size,max_size) VALUES('SeatLock Demo',3,5) ON CONFLICT DO NOTHING RETURNING id"
  )).rows[0] ?? (await client.query<{ id: string }>("SELECT id FROM hackathons ORDER BY created_at LIMIT 1")).rows[0]!;
  await client.query(
    `INSERT INTO users(email,password_hash,skills,tz_offset_minutes,availability_start_minutes,availability_end_minutes)
     SELECT 'seed-' || n || '@seatlock.local',
       '$argon2id$v=19$m=65536,t=3,p=4$seeded',
       CASE n % 6 WHEN 0 THEN '["frontend"]'::jsonb WHEN 1 THEN '["backend"]'::jsonb
       WHEN 2 THEN '["design"]'::jsonb WHEN 3 THEN '["product"]'::jsonb
       WHEN 4 THEN '["ML"]'::jsonb ELSE '["devops"]'::jsonb END,
       ((n % 25) - 12) * 60, (n * 17) % 1200, ((n * 17) % 1200) + 240
     FROM generate_series(0,9999) n
     ON CONFLICT (email) DO NOTHING`
  );
  const leader = (await client.query<{ id: string }>("SELECT id FROM users WHERE email='seed-0@seatlock.local'")).rows[0]!;
  const team = (await client.query<{ id: string }>(
    "INSERT INTO teams(hackathon_id,name,min_size,max_size,member_count) VALUES($1,'Demo team',3,5,1) ON CONFLICT DO NOTHING RETURNING id",
    [hackathon.id]
  )).rows[0] ?? (await client.query<{ id: string }>("SELECT id FROM teams WHERE name='Demo team'")).rows[0]!;
  await client.query("INSERT INTO memberships(team_id,hackathon_id,user_id,role) VALUES($1,$2,$3,'leader') ON CONFLICT DO NOTHING", [team.id, hackathon.id, leader.id]);
  await client.query(
    `INSERT INTO teams(hackathon_id,name,min_size,max_size,member_count)
     SELECT $1,'Seed team ' || n,3,5,1 FROM generate_series(1,2000) n
     ON CONFLICT DO NOTHING`, [hackathon.id]
  );
  await client.query(
    `WITH numbered_teams AS (
       SELECT id,row_number() OVER (ORDER BY created_at,id)::int AS position
       FROM teams WHERE hackathon_id=$1 AND name LIKE 'Seed team %'
     )
     INSERT INTO memberships(team_id,hackathon_id,user_id,role)
     SELECT t.id,$1,u.id,'leader'
     FROM numbered_teams t JOIN users u ON u.email='seed-' || (t.position + 1) || '@seatlock.local'
     ON CONFLICT DO NOTHING`, [hackathon.id]
  );
});
await pool.end();
console.log("Seeded SeatLock demo data");
