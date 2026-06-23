import { router, publicProcedure } from "../trpc/trpc";
import { organizationRouter } from "./organization";
import { projectRouter } from "./project";
import { featureRouter } from "./feature";
import { prdRouter } from "./prd";
import { taskRouter } from "./task";
import { githubRouter } from "./github";
import { reviewRouter } from "./review";
import { releaseRouter } from "./release";
import { billingRouter } from "./billing";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const, timestamp: new Date().toISOString() })),

  org: organizationRouter,
  project: projectRouter,
  feature: featureRouter,
  prd: prdRouter,
  task: taskRouter,
  github: githubRouter,
  review: reviewRouter,
  release: releaseRouter,
  billing: billingRouter,
});

// This is the type the frontend imports for end-to-end type safety --
// never import server-side code (db, auth) into the client, only this type.
export type AppRouter = typeof appRouter;
