import crypto from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "./db/client.js";
const secret = process.env.JWT_SECRET ?? "local-development-secret-change-me";
const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(12).max(200) });
export async function register(input) {
    const { email, password } = credentials.parse(input);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const result = await pool.query("INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id", [email.toLowerCase(), passwordHash]);
    return issue(result.rows[0].id);
}
export async function login(input) {
    const { email, password } = credentials.parse(input);
    const user = (await pool.query("SELECT id,password_hash FROM users WHERE email=$1", [email.toLowerCase()])).rows[0];
    if (!user || !(await argon2.verify(user.password_hash, password)))
        throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
    return issue(user.id);
}
function issue(userId) {
    return { userId, accessToken: jwt.sign({ sub: userId }, secret, { expiresIn: "15m" }) };
}
export function authenticatedUser(request) {
    const header = request.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
        try {
            const payload = jwt.verify(header.slice(7), secret);
            if (typeof payload.sub === "string")
                return payload.sub;
        }
        catch { /* fall through to the demo-only identity header */ }
    }
    const demo = request.headers["x-user-id"];
    if (process.env.NODE_ENV === "test" || process.env.ALLOW_DEMO_AUTH === "true") {
        const parsed = z.string().uuid().safeParse(Array.isArray(demo) ? demo[0] : demo);
        if (parsed.success)
            return parsed.data;
    }
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
}
export function randomToken(bytes = 8) {
    return crypto.randomBytes(bytes).toString("hex");
}
