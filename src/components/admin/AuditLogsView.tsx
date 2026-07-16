"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminBadge, type AdminBadgeTone } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { FilterBar, FilterPill } from "./FilterBar";
import { dateTime } from "./format";
import { listAuditLogs, type AuditLog } from "@/lib/api/admin/governance";

type LoadState = "loading" | "ready" | "error";

const ACTOR_FILTERS = ["all", "human", "agent", "system"] as const;
type ActorFilter = (typeof ACTOR_FILTERS)[number];

function actorTone(actorType: string): AdminBadgeTone {
  switch (actorType) {
    case "human":
      return "blue";
    case "agent":
      return "violet";
    case "system":
      return "slate";
    default:
      return "slate";
  }
}

/**
 * <AuditLogsView> — the append-only audit log viewer (Task 20). Filterable by
 * actor type. Shows who (human / agent / system) did what to which entity and
 * when, with the agent's reasoning where present.
 */
export function AuditLogsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [actor, setActor] = useState<ActorFilter>("all");

  async function load(filter: ActorFilter) {
    setState("loading");
    try {
      const res = await listAuditLogs(
        filter === "all" ? { limit: 100 } : { actorType: filter, limit: 100 },
      );
      setRows(res.logs);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load(actor);
  }, [actor]);

  const columns: Column<AuditLog>[] = [
    {
      key: "created",
      header: "When",
      cell: (l) => (
        <span className="text-[11px] text-admin-ink-3">
          {dateTime(l.created_at)}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      cell: (l) => (
        <AdminBadge tone={actorTone(l.actor_type)}>{l.actor_type}</AdminBadge>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (l) => (
        <span className="font-mono text-[11.5px] font-semibold text-admin-ink">
          {l.action}
        </span>
      ),
    },
    {
      key: "entity",
      header: "Entity",
      cell: (l) => (
        <div>
          <div className="text-[11.5px] text-admin-ink">{l.entity_type}</div>
          {l.entity_id ? (
            <div className="font-mono text-[10.5px] text-admin-ink-3">
              {l.entity_id.slice(0, 8)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "reasoning",
      header: "Reasoning",
      cell: (l) => (
        <span className="text-[11px] text-admin-ink-2">
          {l.reasoning ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div data-component-id="admin-audit-logs">
      <AdminPageHeader
        eyebrow="Governance"
        title="Audit log"
        sub="Append-only record of every money / outreach / status change"
      />
      <FilterBar>
        {ACTOR_FILTERS.map((f) => (
          <FilterPill key={f} active={actor === f} onClick={() => setActor(f)}>
            <span data-actor-filter={f}>{f}</span>
          </FilterPill>
        ))}
      </FilterBar>
      <DataTable
        testId="audit-logs-table"
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        state={state}
        onRetry={() => void load(actor)}
        emptyLabel="No audit entries."
      />
    </div>
  );
}
