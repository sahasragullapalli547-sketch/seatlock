import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./client.js";

const schema = await readFile(fileURLToPath(new URL("./schema.sql", import.meta.url)), "utf8");
await pool.query(schema);
await pool.end();
console.log("SeatLock schema applied");
