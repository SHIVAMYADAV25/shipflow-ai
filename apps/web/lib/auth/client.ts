import { createAuthClient } from "better-auth/react";

// BetterAuth's handler is mounted at /api/auth inside the Next.js app (apps/web).
// baseURL must point to the web origin, NOT the standalone tRPC API server.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});

export const { signIn, signOut, signUp, useSession } = authClient;