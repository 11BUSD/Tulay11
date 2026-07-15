/**
 * Outreach send adapter.
 *
 * `OutreachSendProvider` is the seam transport code sends through. The MVP only
 * ever resolves to `SimulatedSendProvider`, which performs NO network I/O — it
 * logs the dispatch and returns `{ simulated: true }` with a synthetic provider
 * message id. A real provider (Resend/SendGrid/etc.) would slot in behind the
 * same interface but is explicitly out of scope.
 *
 * The send route calls the compliance `assertApprovedBeforeSend` gate BEFORE
 * invoking this adapter; the adapter itself does not gate — it just dispatches.
 */

/** A message ready to dispatch (already approved + gated upstream). */
export interface ApprovedMessage {
  id: string;
  toEmail?: string | null;
  subject?: string | null;
  body: string;
}

/** Result of a dispatch. */
export interface SendResult {
  providerMessageId: string;
  simulated: boolean;
}

/** The transport seam. */
export interface OutreachSendProvider {
  send(msg: ApprovedMessage): Promise<SendResult>;
}

/**
 * Simulated provider — never touches the network. Records the dispatch to the
 * provided logger (default: console.info) and returns a deterministic-ish
 * synthetic provider message id.
 */
export class SimulatedSendProvider implements OutreachSendProvider {
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;

  constructor(
    log: (msg: string, meta?: Record<string, unknown>) => void = () => {},
  ) {
    this.log = log;
  }

  async send(msg: ApprovedMessage): Promise<SendResult> {
    const providerMessageId = `sim-${msg.id}-${Date.now()}`;
    this.log("[SIMULATED SEND] outreach message dispatched (no network)", {
      messageId: msg.id,
      to: msg.toEmail ?? null,
      subject: msg.subject ?? null,
    });
    return { providerMessageId, simulated: true };
  }
}

/**
 * Resolve the active send provider. MVP always returns the simulated provider
 * (no real provider is wired). Kept as a function so a future real provider can
 * be env-selected behind the same interface.
 */
export function getSendProvider(): OutreachSendProvider {
  // MVP: always simulated. A future OUTREACH_SEND_PROVIDER env could select a
  // real provider here.
  return new SimulatedSendProvider();
}
