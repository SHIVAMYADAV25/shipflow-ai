import { auth } from "@shipflow/auth";
import { db, orgMembers } from "@shipflow/db";
import { eq } from "drizzle-orm";
import type { OrgRole } from "@shipflow/common/enums";
import { createRequestLogger } from "@shipflow/logger";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface OrgMembership {
  orgId: string;
  role: OrgRole;
}

/**
 * Built once per incoming HTTP request (see apps/api/src/index.ts and the
 * Next.js fetch adapter in apps/web). Resolves:
 *  1. The authenticated user from the BetterAuth session cookie/header.
 *  2. Every org the user belongs to, with their role in each -- so
 *     permission checks never need an extra DB round trip inside a procedure.
 *  3. A request-scoped logger carrying a requestId (and userId once known)
 *     on every log line emitted while handling this request.
 */
export async function createContext({ headers }: { headers: Headers }) {
  const requestId = crypto.randomUUID();
  const session = await auth.api.getSession({ headers });

  const user: SessionUser | null = session?.user
    ? { id: session.user.id, email: session.user.email, name: session.user.name ?? null }
    : null;

  let memberships: OrgMembership[] = [];
  if (user) {
    const rows = await db
      .select({ orgId: orgMembers.orgId, role: orgMembers.role })
      .from(orgMembers)
      .where(eq(orgMembers.userId, user.id));
    memberships = rows;
  }

  const log = createRequestLogger({ requestId, userId: user?.id });

  return {
    db,
    user,
    memberships,
    requestId,
    log,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
