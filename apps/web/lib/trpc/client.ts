import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@shipflow/api/router-type";

/**
 * This import pulls in ONLY the `AppRouter` type, never any server runtime
 * code (db client, auth secrets, etc.) -- TypeScript erases type-only usage,
 * so nothing from packages/db or packages/auth ends up in the client bundle.
 * If this ever causes a bundling issue, switch to a hand-rolled `import type`
 * re-export from apps/api/src/routers/_app.ts.
 */
export const trpc = createTRPCReact<AppRouter>();
