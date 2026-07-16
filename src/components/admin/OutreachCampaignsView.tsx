"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "./AdminPageHeader";
import { AdminBadge, type AdminBadgeTone } from "./AdminBadge";
import { DataTable, type Column } from "./DataTable";
import { count, dateTime } from "./format";
import {
  listOutreachCampaigns,
  type OutreachCampaign,
} from "@/lib/api/admin/outreach";

type LoadState = "loading" | "ready" | "error";

function campaignTone(status: string | null): AdminBadgeTone {
  switch (status) {
    case "active":
    case "running":
      return "green";
    case "paused":
      return "amber";
    case "completed":
      return "blue";
    case "archived":
      return "slate";
    default:
      return "slate";
  }
}

/**
 * <OutreachCampaignsView> — outreach campaigns (Task 20). Shows message counts
 * and how many drafts are awaiting approval per campaign, linking to the
 * approval queue.
 */
export function OutreachCampaignsView() {
  const [state, setState] = useState<LoadState>("loading");
  const [rows, setRows] = useState<OutreachCampaign[]>([]);

  async function load() {
    setState("loading");
    try {
      const res = await listOutreachCampaigns();
      setRows(res.campaigns);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const columns: Column<OutreachCampaign>[] = [
    {
      key: "name",
      header: "Campaign",
      cell: (c) => (
        <div>
          <div className="font-semibold text-admin-ink">{c.name}</div>
          {c.goal ? (
            <div className="text-[11px] text-admin-ink-3">{c.goal}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "channel",
      header: "Channel",
      cell: (c) => (
        <span className="text-[11.5px] text-admin-ink-2">
          {c.channel ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <AdminBadge tone={campaignTone(c.status)}>
          {c.status ?? "—"}
        </AdminBadge>
      ),
    },
    {
      key: "messages",
      header: "Messages",
      align: "right",
      cell: (c) => (
        <span className="font-mono tabular-nums">{count(c.message_count)}</span>
      ),
    },
    {
      key: "awaiting",
      header: "Awaiting approval",
      align: "right",
      cell: (c) =>
        Number(c.awaiting_count) > 0 ? (
          <Link
            href="/admin/outreach/approvals"
            className="font-mono font-semibold text-admin-teal underline"
          >
            {count(c.awaiting_count)}
          </Link>
        ) : (
          <span className="font-mono text-admin-ink-3">0</span>
        ),
    },
    {
      key: "created",
      header: "Created",
      align: "right",
      cell: (c) => (
        <span className="text-[11px] text-admin-ink-3">
          {dateTime(c.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div data-component-id="admin-outreach-campaigns">
      <AdminPageHeader
        eyebrow="Agent & Outreach"
        title="Outreach campaigns"
        sub="Agent-run partner outreach campaigns and their approval backlog"
      />
      <DataTable
        testId="outreach-campaigns-table"
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        state={state}
        onRetry={() => void load()}
        emptyLabel="No campaigns yet."
      />
    </div>
  );
}
