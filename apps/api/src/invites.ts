import crypto from "node:crypto";
import { inTransaction } from "./db/client.js";
import { joinTeamInClient } from "./teams.js";

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const secret = process.env.INVITE_SECRET ?? "local-invite-secret-change-me";
function checksum(value: string): string {
  let sum = 0;
  for (const char of value) sum = (sum * 31 + alphabet.indexOf(char)) % 32;
  return alphabet[sum]!;
}
export function createCode(): string {
  let value = "";
  const bytes = crypto.randomBytes(10);
  for (let index = 0; index < 10; index += 1) value += alphabet[bytes[index]! % alphabet.length];
  return value + checksum(value);
}
function digest(code: string): Buffer {
  return crypto.createHmac("sha256", secret).update(code).digest();
}

export async function issueInvite(actorId: string, teamId: string, maxUses: number | null): Promise<{ code: string; expiresAt: string }> {
  const code = createCode();
  return inTransaction(async (client) => {
    const leader = await client.query("SELECT 1 FROM memberships WHERE team_id=$1 AND user_id=$2 AND role='leader'", [teamId, actorId]);
    if (!leader.rowCount) throw Object.assign(new Error("Leader permission required"), { statusCode: 403 });
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.query("INSERT INTO invite_codes(team_id,digest,expires_at,max_uses) VALUES($1,$2,$3,$4)", [teamId, digest(code), expires, maxUses]);
    return { code, expiresAt: expires.toISOString() };
  });
}

export async function redeemInvite(userId: string, code: string): Promise<{ teamId: string; memberCount: number }> {
  if (!/^[0-9A-Z]{11}$/.test(code) || checksum(code.slice(0, 10)) !== code[10]) throw Object.assign(new Error("Invite is unavailable"), { statusCode: 404 });
  return inTransaction(async (client) => {
    const invite = (await client.query<{ team_id: string; expires_at: Date; max_uses: number | null; uses: number; revoked_at: Date | null }>(
      "SELECT team_id,expires_at,max_uses,uses,revoked_at FROM invite_codes WHERE digest=$1 FOR UPDATE", [digest(code)]
    )).rows[0];
    if (!invite || invite.revoked_at || invite.expires_at <= new Date() || (invite.max_uses !== null && invite.uses >= invite.max_uses)) throw Object.assign(new Error("Invite is unavailable"), { statusCode: 404 });
    await client.query("UPDATE invite_codes SET uses=uses+1 WHERE digest=$1", [digest(code)]);
    return joinTeamInClient(client, userId, invite.team_id);
  });
}
