import { verify } from "@octokit/webhooks-methods";
import { createLogger } from "@shipflow/logger";

const log = createLogger("github.webhook");

/**
 * Verifies the `X-Hub-Signature-256` header GitHub sends on every webhook
 * delivery, using a constant-time comparison (handled internally by
 * @octokit/webhooks-methods). MUST be called on the raw request body string
 * before it's JSON.parse'd -- signing is over the exact bytes GitHub sent.
 */
export async function verifyGithubWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    log.error("GITHUB_APP_WEBHOOK_SECRET is not set -- refusing to accept webhook");
    return false;
  }
  if (!signatureHeader) {
    log.warn("webhook delivery missing X-Hub-Signature-256 header");
    return false;
  }

  const valid = await verify(secret, rawBody, signatureHeader);
  if (!valid) {
    log.warn("webhook signature verification failed");
  }
  return valid;
}
