"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * <DataTable> — a generic, dense admin table used across every admin list
 * screen. Columns declare a header + a per-row cell renderer, so callers keep
 * full control over how each value is rendered (badges, MaskedField, money via
 * the `format` helpers, action buttons, etc.).
 *
 * Handles loading (skeleton rows), error (with retry), and empty states, and an
 * optional per-row action column. Kept presentational — data fetching lives in
 * the page/view that renders it.
 */
export interface Column<T> {
  /** Stable key (also used for the header cell key). */
  key: string;
  header: ReactNode;
  /** Render the cell for a row. */
  cell: (row: T) => ReactNode;
  /** Right-align numeric/money columns. */
  align?: "left" | "right";
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  state?: "loading" | "ready" | "error";
  onRetry?: () => void;
  emptyLabel?: string;
  errorLabel?: string;
  /** data-component-id for tests / preview instrumentation. */
  testId?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  state = "ready",
  onRetry,
  emptyLabel = "No records found.",
  errorLabel = "Could not load data.",
  testId = "data-table",
  className,
}: DataTableProps<T>) {
  return (
    <div
      data-component-id={testId}
      className={cn(
        "overflow-x-auto rounded-lg border border-admin-border bg-admin-surface shadow-sm",
        className,
      )}
    >
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "border-b border-admin-border bg-admin-surface2 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-admin-ink-3",
                  col.align === "right" ? "text-right" : "text-left",
                )}
                scope="col"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state === "loading" ? (
            <tr data-component-id={`${testId}-loading`}>
              <td colSpan={columns.length} className="px-3.5 py-6">
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-full animate-pulse rounded bg-admin-surface2" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-admin-surface2" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-admin-surface2" />
                </div>
              </td>
            </tr>
          ) : null}

          {state === "error" ? (
            <tr data-component-id={`${testId}-error`}>
              <td
                colSpan={columns.length}
                className="px-3.5 py-8 text-center text-admin-red"
              >
                <p role="alert">{errorLabel}</p>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-2 rounded-lg border border-admin-border-strong bg-admin-surface px-3 py-1.5 text-xs font-semibold text-admin-ink hover:bg-admin-surface2"
                  >
                    Retry
                  </button>
                ) : null}
              </td>
            </tr>
          ) : null}

          {state === "ready" && rows.length === 0 ? (
            <tr data-component-id={`${testId}-empty`}>
              <td
                colSpan={columns.length}
                className="px-3.5 py-8 text-center text-admin-ink-3"
              >
                {emptyLabel}
              </td>
            </tr>
          ) : null}

          {state === "ready"
            ? rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-admin-border last:border-b-0 hover:bg-admin-surface2"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3.5 py-2.5 align-middle text-admin-ink",
                        col.align === "right" ? "text-right" : "text-left",
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}
