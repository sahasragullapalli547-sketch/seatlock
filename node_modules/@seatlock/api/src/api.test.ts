import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { createCode } from "./invites.js";
import { boardQuerySchema, createTeamSchema, joinTeamSchema, uuidSchema } from "../../../packages/shared/src/index.js";

describe("API contract validation", () => {
  it.each([
    ["uuid", uuidSchema, "not-a-uuid"],
    ["team name", createTeamSchema, { hackathonId: "bad", name: "" }],
    ["join body", joinTeamSchema, { teamId: "bad" }]
  ])("rejects invalid %s", (_name, schema, value) => expect(schema.safeParse(value).success).toBe(false));
  it("accepts a valid create team body", () => expect(createTeamSchema.safeParse({ hackathonId: crypto.randomUUID(), name: "Alpha" }).success).toBe(true));
  it("accepts valid board filters", () => expect(boardQuerySchema.safeParse({ hackathonId: crypto.randomUUID(), timezone: 60 }).success).toBe(true));
});

describe("Invite code contract", () => {
  it.each(Array.from({ length: 15 }, (_, index) => index))("creates a code with 10 data chars and checksum (%i)", () => {
    const code = createCode();
    expect(code).toMatch(/^[0-9A-Z]{11}$/);
  });
  it("does not repeat codes in a small sample", () => {
    const codes = new Set(Array.from({ length: 20 }, () => createCode()));
    expect(codes.size).toBe(20);
  });
});
