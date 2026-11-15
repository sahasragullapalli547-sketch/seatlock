import { Pool, PoolClient } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://seatlock:seatlock@localhost:5432/seatlock"
});

export async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
