"use client";

import { money, count } from "./format";
import type { RevenueSlice } from "@/lib/api/admin/revenue";

/**
 * <RevenueChart> — a horizontal bar breakdown of revenue slices (integer cents,
 * coerced + formatted via the admin `money` helper). Each bar's width is
 * proportional to the max slice, so the chart renders deterministically from
 * data (no chart lib). Handles loading + empty states.
 */
const BAR_COLORS = [
  "var(--color-admin)",
  "var(--color-admin-teal)",
  "var(--color-admin-600)",
  "var(--color-admin-violet)",
  "var(--color-admin-blue)",
  "var(--color-admin-slate)",
];

export function RevenueChart({
  title,
  slices,
  state = "ready",
  testId = "revenue-chart",
}: {
  title: string;
  slices: RevenueSlice[];
  state?: "loading" | "ready" | "error";
  testId?: string;
}) {
  const max = slices.reduce((m, s) => Math.max(m, s.total_cents), 0);

  return (
    <div
      data-component-id={testId}
      className="rounded-lg border border-admin-border bg-admin-surface shadow-sm"
    >
      <div className="flex items-center gap-2.5 border-b border-admin-border px-4 py-3.5">
        <h3 className="text-[13.5px] font-bold text-admin-ink">{title}</h3>
      </div>
      <div className="p-4">
        {state === "loading" ? (
          <div className="flex flex-col gap-3" data-component-id={`${testId}-loading`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-6 w-full animate-pulse rounded bg-admin-surface2"
              />
            ))}
          </div>
        ) : slices.length === 0 ? (
          <p
            data-component-id={`${testId}-empty`}
            className="py-6 text-center text-[12.5px] text-admin-ink-3"
          >
            No revenue recorded for this dimension.
          </p>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {slices.map((slice, i) => {
              const pct = max > 0 ? Math.round((slice.total_cents / max) * 100) : 0;
              return (
                <li key={slice.key} data-component-id={`${testId}-row`}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <b className="text-admin-ink">{slice.key}</b>
                    <span className="font-mono font-semibold tabular-nums text-admin-ink">
                      {money(slice.total_cents)}
                      <span className="ml-1.5 text-[11px] font-normal text-admin-ink-3">
                        {count(slice.event_count)} events
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded bg-admin-surface2">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${pct}%`,
                        background: BAR_COLORS[i % BAR_COLORS.length],
                      }}
                      role="presentation"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3.5 text-[11px] text-admin-ink-3">
          All revenue stored as integer cents; displayed formatted to $.
        </p>
      </div>
    </div>
  );
}
