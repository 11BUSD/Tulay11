"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminButton } from "./AdminButton";
import { AdminBadge } from "./AdminBadge";
import { MetricCard } from "./MetricCard";
import {
  listOutreachMessages,
  approveMessage,
  rejectMessage,
  type OutreachMessage,
  type RiskFlag,
} from "@/lib/api/admin/outreach";
import { ApiError } from "@/lib/api/client";

type LoadState = "loading" | "ready" | "error";

/** Coerce stored draft_risk_flags (array | json string | null) into RiskFlag[]. */
function normalizeFlags(raw: OutreachMessage["draft_risk_flags"]): RiskFlag[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RiskFlag[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function confidencePct(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return null;
  // Confidence stored 0..1.
  return Math.round(Math.max(0, Math.min(1, n)) * 100);
}

function riskTone(severity?: string) {
  if (severity === "high") return "red" as const;
  if (severity === "medium") return "amber" as const;
  return "slate" as const;
}

/**
 * <ApprovalQueue> (AC8) — the human-approval gate for agent-drafted outbound
 * outreach. Nothing sends without a human here. Each queued draft shows its
 * reasoning, confidence and any risk flags, with Approve / Reject actions.
 *
 * Approve calls POST /api/outreach/messages/[id]/approve; the server refuses
 * (422 `blocking_risk_flags`) when a high-severity risk flag is present, and we
 * surface that as a per-row alert rather than crashing. Reject requires a
 * reason and calls .../reject.
 */
export function ApprovalQueue() {
  const [state, setState] = useState<LoadState>("loading");
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function load() {
    setState("loading");
    try {
      const res = await listOutreachMessages({ state: "drafted" });
      setMessages(res.messages);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function clearRowError(id: string) {
    setRowError((prev) => {
      const { [id]: _omit, ...rest } = prev;
      void _omit;
      return rest;
    });
  }

  function remove(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  async function approve(id: string) {
    setBusyId(id);
    clearRowError(id);
    try {
      await approveMessage(id);
      remove(id);
    } catch (err) {
      let msg = "Approval failed.";
      if (err instanceof ApiError && err.status === 422) {
        msg =
          "Blocked: this draft has high-severity risk flags and cannot be approved. Reject or edit it.";
      }
      setRowError((prev) => ({ ...prev, [id]: msg }));
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject(id: string) {
    if (!reason.trim()) {
      setRowError((prev) => ({ ...prev, [id]: "A reason is required to reject." }));
      return;
    }
    setBusyId(id);
    clearRowError(id);
    try {
      await rejectMessage(id, reason.trim());
      setRejecting(null);
      setReason("");
      remove(id);
    } catch {
      setRowError((prev) => ({ ...prev, [id]: "Reject failed." }));
    } finally {
      setBusyId(null);
    }
  }

  const blockingCount = useMemo(
    () =>
      messages.filter((m) =>
        normalizeFlags(m.draft_risk_flags).some((f) => f.severity === "high"),
      ).length,
    [messages],
  );

  return (
    <div data-component-id="admin-approval-queue">
      <AdminPageHeader
        eyebrow="Agent & Outreach · Governance"
        title="Approval queue"
        sub="Human approval gate — no agent-drafted message sends without sign-off here."
      />

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        <MetricCard
          testId="approval-awaiting"
          label="Awaiting approval"
          value={String(messages.length)}
          foot="drafted"
        />
        <MetricCard
          testId="approval-blocking"
          label="With blocking flags"
          value={String(blockingCount)}
          foot="cannot be approved"
        />
        <MetricCard
          testId="approval-gate"
          label="Gate"
          value="Enforced"
          foot="server-side"
        />
      </div>

      <div
        data-component-id="approval-gate-notice"
        className="mb-4 rounded-lg border border-admin-border bg-admin-teal-050 p-3 text-[12px] text-admin-teal"
      >
        <b>Nothing sends automatically.</b> Every outbound message is drafted by
        an agent and held here until a human approves it. Drafts with
        high-severity (blocking) risk flags are refused by the server and must be
        rejected or edited.
      </div>

      {state === "loading" ? (
        <div
          data-component-id="approval-loading"
          className="rounded-lg border border-admin-border bg-admin-surface p-6"
        >
          <div className="mb-2 h-4 w-1/3 animate-pulse rounded bg-admin-surface2" />
          <div className="h-24 w-full animate-pulse rounded bg-admin-surface2" />
        </div>
      ) : null}

      {state === "error" ? (
        <div
          data-component-id="approval-error"
          className="rounded-lg border border-admin-border bg-admin-surface p-6 text-center"
        >
          <p role="alert" className="text-admin-red">
            Could not load the approval queue.
          </p>
          <AdminButton className="mt-3" onClick={() => void load()}>
            Retry
          </AdminButton>
        </div>
      ) : null}

      {state === "ready" && messages.length === 0 ? (
        <div
          data-component-id="approval-empty"
          className="rounded-lg border border-admin-border bg-admin-surface p-8 text-center text-admin-ink-3"
        >
          Nothing awaiting approval. The queue is clear.
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="flex flex-col gap-4">
          {messages.map((m) => {
            const flags = normalizeFlags(m.draft_risk_flags);
            const hasBlocking = flags.some((f) => f.severity === "high");
            const pct = confidencePct(m.draft_confidence);
            const subject = m.draft_subject ?? m.subject ?? "(no subject)";
            const body = m.draft_body ?? m.body ?? "";
            return (
              <div
                key={m.id}
                data-component-id="approval-card"
                data-message-id={m.id}
                className="rounded-lg border border-admin-border bg-admin-surface p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-admin-ink-3">
                        {m.direction ?? "outbound"}
                        {m.sequence_step != null
                          ? ` · step ${m.sequence_step}`
                          : ""}
                      </span>
                      {hasBlocking ? (
                        <AdminBadge tone="red">Blocking risk</AdminBadge>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[14px] font-semibold text-admin-ink">
                      {subject}
                    </div>
                  </div>
                  {pct != null ? (
                    <div
                      data-component-id="approval-confidence"
                      className="text-right"
                    >
                      <div className="text-[11px] text-admin-ink-3">
                        Confidence
                      </div>
                      <div className="font-mono text-[13px] font-semibold text-admin-ink">
                        {pct}%
                      </div>
                    </div>
                  ) : null}
                </div>

                <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-admin-ink-2">
                  {body}
                </p>

                {m.draft_reasoning ? (
                  <div className="mt-3 rounded-lg border border-admin-border bg-admin-surface2 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-admin-ink-3">
                      Agent reasoning
                    </div>
                    <p className="mt-1 text-[12px] text-admin-ink-2">
                      {m.draft_reasoning}
                    </p>
                  </div>
                ) : null}

                {flags.length > 0 ? (
                  <div
                    data-component-id="approval-risk-flags"
                    className="mt-3 flex flex-wrap gap-1.5"
                  >
                    {flags.map((f, i) => (
                      <AdminBadge key={`${f.code ?? i}`} tone={riskTone(f.severity)}>
                        {f.severity ?? "info"}: {f.message ?? f.code ?? "risk"}
                      </AdminBadge>
                    ))}
                  </div>
                ) : null}

                {rowError[m.id] ? (
                  <p
                    role="alert"
                    className="mt-3 rounded-lg border border-[#e6c9c9] bg-admin-red-bg px-3 py-2 text-[11.5px] text-admin-red"
                  >
                    {rowError[m.id]}
                  </p>
                ) : null}

                {rejecting === m.id ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <label
                      className="text-[11px] font-semibold uppercase tracking-wide text-admin-ink-3"
                      htmlFor={`reject-reason-${m.id}`}
                    >
                      Rejection reason
                    </label>
                    <textarea
                      id={`reject-reason-${m.id}`}
                      className="admin-input min-h-[64px]"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why is this draft being rejected?"
                    />
                    <div className="flex justify-end gap-2">
                      <AdminButton
                        sm
                        variant="ghost"
                        disabled={busyId === m.id}
                        onClick={() => {
                          setRejecting(null);
                          setReason("");
                          clearRowError(m.id);
                        }}
                      >
                        Cancel
                      </AdminButton>
                      <AdminButton
                        sm
                        variant="danger"
                        disabled={busyId === m.id}
                        data-action="confirm-reject"
                        onClick={() => void submitReject(m.id)}
                      >
                        Confirm reject
                      </AdminButton>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end gap-2">
                    <AdminButton
                      sm
                      variant="danger"
                      disabled={busyId === m.id}
                      data-action="reject"
                      onClick={() => {
                        clearRowError(m.id);
                        setReason("");
                        setRejecting(m.id);
                      }}
                    >
                      Reject
                    </AdminButton>
                    <AdminButton
                      sm
                      variant="ok"
                      disabled={busyId === m.id}
                      data-action="approve"
                      onClick={() => void approve(m.id)}
                    >
                      Approve & queue send
                    </AdminButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
