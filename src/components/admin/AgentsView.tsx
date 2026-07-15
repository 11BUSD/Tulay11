"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminBadge, type AdminBadgeTone } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { FilterBar, FilterPill } from "./FilterBar";
import { dateTime } from "./format";
import { listAgentRuns, type AgentRun } from "@/lib/api/admin/agents";

type LoadState = "loading" | "ready" | "error";

const STATUS_FILTERS = ["all", "succeeded", "failed", "running"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function statusTone(status: string): AdminBadgeTone {
  switch (status) {
    case "succeeded":
    case "completed":
      return "green";
    case "running":
    case "pending":
      return "amber";
    case "failed":
    case "error":
      return "red";
    default:
      return "slate";
  }
}

function confidencePct(value: number | string | null): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

/**
 * <AgentsView> — the agent activity feed (Task 20) per `agent-activity.html`.
 * Read-only view of agent runs: which agent ran, its status, confidence and
 * reasoning summary. Filterable by run status.
 */
export function AgentsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<AgentRun[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");

  async function load(filter: StatusFilter) {
    setState("loading");
    try {
      const res = await listAgentRuns(
        filter === "all" ? {} : { status: filter },
      );
      setRows(res.runs);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load(status);
  }, [status]);

  const columns: Column<AgentRun>[] = [
    {
      key: "agent",
      header: "Agent",
      cell: (r) => (
        <div>
          <div className="font-mono text-[11.5px] font-semibold text-admin-ink">
            {r.agent_key}
          </div>
          {r.agent_version ? (
            <div className="text-[10.5px] text-admin-ink-3">
              v{r.agent_version}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <AdminBadge tone={statusTone(r.status)}>{r.status}</AdminBadge>
      ),
    },
    {
      key: "trigger",
      header: "Trigger",
      cell: (r) => (
        <span className="text-[11.5px] text-admin-ink-2">
          {r.trigger_type ?? "—"}
        </span>
      ),
    },
    {
      key: "confidence",
      header: "Confidence",
      align: "right",
      cell: (r) => (
        <span className="font-mono tabular-nums">
          {confidencePct(r.confidence)}
        </span>
      ),
    },
    {
      key: "reasoning",
      header: "Summary",
      cell: (r) => (
        <span className="text-[11px] text-admin-ink-2">
          {r.error ? (
            <span className="text-admin-red">{r.error}</span>
          ) : (
            (r.reasoning_summary ?? "—")
          )}
        </span>
      ),
    },
    {
      key: "when",
      header: "Ran",
      align: "right",
      cell: (r) => (
        <span className="text-[11px] text-admin-ink-3">
          {dateTime(r.finished_at ?? r.started_at ?? r.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div data-component-id="admin-agents">
      <AdminPageHeader
        eyebrow="Agent & Outreach"
        title="Agent activity"
        sub="Every agent run, its confidence and reasoning · outbound still gated by human approval"
      />
      <FilterBar>
        {STATUS_FILTERS.map((f) => (
          <FilterPill key={f} active={status === f} onClick={() => setStatus(f)}>
            <span data-status-filter={f}>{f}</span>
          </FilterPill>
        ))}
      </FilterBar>
      <DataTable
        testId="agent-runs-table"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        state={state}
        onRetry={() => void load(status)}
        emptyLabel="No agent runs recorded."
      />
    </div>
  );
}
