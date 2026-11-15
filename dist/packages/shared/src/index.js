import { z } from "zod";
export const uuidSchema = z.string().uuid();
export const createTeamSchema = z.object({
    hackathonId: uuidSchema,
    name: z.string().trim().min(1).max(100)
});
export const joinTeamSchema = z.object({ teamId: uuidSchema });
export const leaveTeamSchema = z.object({ teamId: uuidSchema });
export const boardQuerySchema = z.object({
    hackathonId: uuidSchema,
    cursor: z.string().optional(),
    timezone: z.coerce.number().int().min(-840).max(840).optional(),
    skill: z.string().trim().max(40).optional()
});
