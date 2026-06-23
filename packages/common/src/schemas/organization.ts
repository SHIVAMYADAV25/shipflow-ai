import { z } from "zod";
import { ORG_ROLES } from "../enums";
// subscriptionPlanSchema lives in ./billing -- imported here, not redefined,
// so there is exactly one Zod schema per enum across the whole package.
import { subscriptionPlanSchema } from "./billing";

export const orgRoleSchema = z.enum(ORG_ROLES);

export const createOrganizationInput = z.object({
  name: z.string().min(2).max(256),
  slug: z
    .string()
    .min(2)
    .max(256)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInput>;

export const inviteMemberInput = z.object({
  orgId: z.string().uuid(),
  email: z.string().email(),
  role: orgRoleSchema.exclude(["owner"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberInput>;

export const updateMemberRoleInput = z.object({
  orgId: z.string().uuid(),
  memberId: z.string().uuid(),
  role: orgRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInput>;

export const organizationOutput = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  plan: subscriptionPlanSchema,
  aiCreditsUsed: z.number().int(),
  aiCreditsLimit: z.number().int(),
  repoLimit: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type OrganizationOutput = z.infer<typeof organizationOutput>;

export const orgMemberOutput = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  role: orgRoleSchema,
  user: z.object({
    id: z.string().uuid(),
    name: z.string().nullable(),
    email: z.string().email(),
    image: z.string().nullable(),
  }),
});
export type OrgMemberOutput = z.infer<typeof orgMemberOutput>;
