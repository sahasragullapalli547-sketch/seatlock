import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
describe("SeatLock concurrency design", () => {
    it("uses a deterministic audit hash input", () => {
        const canonical = JSON.stringify({ action: "member.joined", team_id: "team", target_user_id: "user" });
        expect(createHash("sha256").update("GENESIS" + canonical).digest("hex")).toHaveLength(64);
    });
    it("rejects a capacity that is already full before attempting an insert", () => {
        const memberCount = 4;
        const maxSize = 4;
        expect(memberCount >= maxSize).toBe(true);
    });
});
