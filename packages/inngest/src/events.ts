/**
 * Every event ShipFlow's async workflows run on, in one place. Senders
 * (apps/api's tRPC routers and webhook handlers) and consumers (apps/inngest
 * functions) both import this type, so a payload shape change is a compile
 * error on both sides instead of a silent runtime mismatch.
 */
export type ShipflowEvents = {
  /** Sent right after a feature request row is inserted. Kicks off discovery. */
  "feature/created": {
    data: { featureId: string; projectId: string };
  };
  /** Sent after the requester (or PM) replies to a discovery follow-up question. */
  "feature/discovery.message": {
    data: { featureId: string };
  };
  /** Sent when discovery concludes readyForPrd=true. */
  "prd/generate.requested": {
    data: { featureId: string };
  };
  /** Sent by the PRD approval mutation. */
  "prd/approved": {
    data: { prdId: string; featureId: string };
  };
  /** Sent by the task-generation trigger (manual or chained off prd/approved). */
  "tasks/generate.requested": {
    data: { prdId: string };
  };
  /** Sent by the GitHub webhook handler on pull_request opened/reopened/ready_for_review. */
  "github/pull_request.opened": {
    data: { pullRequestId: string };
  };
  /** Sent by the GitHub webhook handler on pull_request synchronize (new commits pushed). */
  "github/pull_request.synchronized": {
    data: { pullRequestId: string };
  };
  /** Sent by the Razorpay webhook handler after a subscription state change is persisted. */
  "billing/subscription.updated": {
    data: { orgId: string };
  };
};
