import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { createLogger } from "@shipflow/logger";

const log = createLogger("github.app");

function getAppCredentials() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    throw new Error(
      "GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY are not set. Create a GitHub App and fill in .env.",
    );
  }
  // Private keys are usually stored in env as a single line with literal
  // "\n" sequences -- restore real newlines before handing it to Octokit.
  return { appId, privateKey: privateKey.replace(/\\n/g, "\n") };
}

const installationClientCache = new Map<string, { client: Octokit; expiresAt: number }>();

/**
 * Returns an Octokit client authenticated as a specific installation of our
 * GitHub App (i.e. scoped to the repos that installation has access to).
 * Installation tokens expire after ~1 hour; we cache and refresh lazily.
 */
export async function getInstallationOctokit(installationId: string): Promise<Octokit> {
  const cached = installationClientCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.client;
  }

  const { appId, privateKey } = getAppCredentials();
  const auth = createAppAuth({ appId, privateKey });
  const installationAuth = await auth({ type: "installation", installationId: Number(installationId) });

  const client = new Octokit({ auth: installationAuth.token });
  installationClientCache.set(installationId, {
    client,
    expiresAt: new Date(installationAuth.expiresAt).getTime(),
  });

  log.debug({ installationId }, "minted new GitHub installation token");
  return client;
}

/** App-level (not installation-scoped) client -- used for installation management endpoints. */
export function getAppOctokit(): Octokit {
  const { appId, privateKey } = getAppCredentials();
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });
}
