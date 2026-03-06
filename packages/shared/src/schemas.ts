import { z } from "zod";
import { ROLES } from "./rbac";

export const roleSchema = z.enum(ROLES);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(64).optional()
});

export type RoleInput = z.infer<typeof roleSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
