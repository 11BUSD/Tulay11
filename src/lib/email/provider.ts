/**
 * Lifecycle email — provider interface + a simulated (no-network) provider.
 *
 * MVP does NOT send real email. `SimulatedEmailProvider` records "sends" in
 * memory and logs them, so lifecycle flows are exercisable end-to-end without
 * any network egress. It enforces CASL controls before every send:
 *   - the recipient must not be unsubscribed, AND
 *   - a live consent basis (express or unexpired implied) must apply for the
 *     message purpose — both answered by `canContact` in `compliance/casl.ts`.
 *
 * Every simulated message carries a one-click unsubscribe URL (CASL requires a
 * working opt-out in each message), pointing at `GET /api/unsubscribe`.
 *
 * Wiring a real ESP later means implementing `EmailProvider.send` against the
 * ESP API — the CASL gate and unsubscribe-URL construction stay here so they
 * can never be bypassed.
 */
import { canContact } from "@/lib/compliance/casl";
import type { ServiceDb } from "@/lib/db/client";
import type { ConsentPurpose } from "@/lib/validation";

/** An outbound lifecycle message. */
export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text/HTML body (footer with unsubscribe link is appended). */
  body: string;
  /** CASL consent purpose this message relies on (e.g. `marketing`). */
  purpose: ConsentPurpose;
}

/** Result of a send attempt. */
export interface EmailSendResult {
  /** True when the message was accepted for (simulated) delivery. */
  delivered: boolean;
  /** Why a send was skipped, when `delivered` is false. */
  skippedReason?: "unsubscribed_or_no_consent";
  /** The one-click unsubscribe URL embedded in the message. */
  unsubscribeUrl: string;
}

/** The provider contract lifecycle flows depend on. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Options for the simulated provider. */
export interface SimulatedEmailProviderOptions {
  /** Base URL used to build the one-click unsubscribe link. */
  baseUrl?: string;
  /** Injectable DB for the CASL consent check (defaults to the process DB). */
  db?: ServiceDb;
  /** Injectable clock for deterministic implied-consent expiry in tests. */
  now?: () => Date;
  /** Sink for the "sent" log line (defaults to console.info). */
  logger?: (line: string, message: EmailMessage) => void;
}

/**
 * Build the CASL-required one-click unsubscribe URL for a recipient. Points at
 * the existing `GET /api/unsubscribe` route (which records the opt-out + a
 * consent withdrawal + audit in one transaction).
 */
export function buildUnsubscribeUrl(
  email: string,
  baseUrl = "",
  channel: "email" | "sms" | "all" = "email",
): string {
  const qs = new URLSearchParams({ email, channel }).toString();
  return `${baseUrl}/api/unsubscribe?${qs}`;
}

/**
 * A no-network email provider. Records every attempt so tests/flows can assert
 * what would have been sent, and enforces the CASL gate before each send.
 */
export class SimulatedEmailProvider implements EmailProvider {
  /** In-memory record of accepted (simulated) sends. */
  readonly sent: (EmailMessage & { unsubscribeUrl: string })[] = [];
  /** In-memory record of skipped attempts (CASL gate refused). */
  readonly skipped: EmailMessage[] = [];

  private readonly baseUrl: string;
  private readonly db?: ServiceDb;
  private readonly now: () => Date;
  private readonly logger: (line: string, message: EmailMessage) => void;

  constructor(opts: SimulatedEmailProviderOptions = {}) {
    this.baseUrl = opts.baseUrl ?? "";
    this.db = opts.db;
    this.now = opts.now ?? (() => new Date());
    this.logger =
      opts.logger ??
      ((line) => {
        // Simulated: log only, never send over the network.
        console.info(line);
      });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const unsubscribeUrl = buildUnsubscribeUrl(message.to, this.baseUrl);

    // CASL gate: not unsubscribed AND a live consent basis for the purpose.
    const allowed = await canContact(message.to, message.purpose, {
      channel: "email",
      now: this.now(),
      db: this.db,
    });

    if (!allowed) {
      this.skipped.push(message);
      return {
        delivered: false,
        skippedReason: "unsubscribed_or_no_consent",
        unsubscribeUrl,
      };
    }

    this.sent.push({ ...message, unsubscribeUrl });
    this.logger(
      `[simulated-email] to=${message.to} subject="${message.subject}" (unsubscribe: ${unsubscribeUrl})`,
      message,
    );
    return { delivered: true, unsubscribeUrl };
  }
}

export default SimulatedEmailProvider;
