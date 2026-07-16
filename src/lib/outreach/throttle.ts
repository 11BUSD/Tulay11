/**
 * Outreach throttle.
 *
 * Enforces three caps so a contact/campaign is never over-messaged:
 *   - per-contact min-gap between two messages (default 3 days),
 *   - per-contact max messages per campaign (default 4),
 *   - per-campaign daily send cap (default 200).
 *
 * `checkThrottle` returns a structured decision; sequencing uses it before
 * drafting/scheduling and the send route re-checks it before dispatch.
 */
import { getServiceDb, type ServiceDb } from "../db/client";

/** Throttle configuration (all overridable per call). */
export interface ThrottleConfig {
  /** Minimum gap between messages to the same contact (ms). */
  minGapMs: number;
  /** Max messages to one contact within one campaign. */
  maxPerContactPerCampaign: number;
  /** Max sends across a campaign within a rolling 24h window. */
  maxPerCampaignPerDay: number;
}

export const DEFAULT_THROTTLE: ThrottleConfig = {
  minGapMs: 3 * 24 * 60 * 60 * 1000,
  maxPerContactPerCampaign: 4,
  maxPerCampaignPerDay: 200,
};

/** The outcome of a throttle check. */
export interface ThrottleDecision {
  allowed: boolean;
  reason?: "min_gap" | "contact_cap" | "campaign_daily_cap";
  message?: string;
}

/**
 * Decide whether another message to `contactId` in `campaignId` is allowed. A
 * "message" here counts rows that have actually gone out or are in-flight
 * (state in sent/follow_up_due/approved) — drafts do not consume the cap until
 * they progress.
 */
export async function checkThrottle(
  contactId: string,
  campaignId: string,
  opts: {
    now?: Date;
    config?: Partial<ThrottleConfig>;
    db?: ServiceDb;
  } = {},
): Promise<ThrottleDecision> {
  const db = opts.db ?? getServiceDb();
  const now = opts.now ?? new Date();
  const cfg = { ...DEFAULT_THROTTLE, ...(opts.config ?? {}) };

  const countedStates = "('approved','sent','follow_up_due')";

  // Per-contact cap within the campaign.
  const [contactCount] = await db.query<{ count: string; last_sent: string | null }>(
    `select count(*)::text as count, max(coalesce(sent_at, updated_at)) as last_sent
       from outreach_messages
      where contact_id = $1 and campaign_id = $2
        and state in ${countedStates}`,
    [contactId, campaignId],
  );
  const count = Number(contactCount?.count ?? "0");
  if (count >= cfg.maxPerContactPerCampaign) {
    return {
      allowed: false,
      reason: "contact_cap",
      message: `Contact reached the per-campaign cap (${cfg.maxPerContactPerCampaign}).`,
    };
  }

  // Min-gap since the last message to this contact.
  if (contactCount?.last_sent) {
    const last = new Date(contactCount.last_sent).getTime();
    if (now.getTime() - last < cfg.minGapMs) {
      return {
        allowed: false,
        reason: "min_gap",
        message: "Minimum gap between messages to this contact not elapsed.",
      };
    }
  }

  // Per-campaign daily cap.
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [dayCount] = await db.query<{ count: string }>(
    `select count(*)::text as count
       from outreach_messages
      where campaign_id = $1 and state = 'sent'
        and coalesce(sent_at, updated_at) >= $2`,
    [campaignId, since],
  );
  if (Number(dayCount?.count ?? "0") >= cfg.maxPerCampaignPerDay) {
    return {
      allowed: false,
      reason: "campaign_daily_cap",
      message: `Campaign reached the daily send cap (${cfg.maxPerCampaignPerDay}).`,
    };
  }

  return { allowed: true };
}
