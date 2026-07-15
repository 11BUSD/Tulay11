"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * True if a stored value looks like a versioned hash (`v1:<64 hex>`). Inlined
 * here (rather than importing `@/lib/compliance/hashing`) so this client
 * component does not pull `node:crypto` into the browser bundle — the shape of
 * a hash is a pure regex check and needs no crypto.
 */
function isHashed(value: string | null | undefined): boolean {
  return typeof value === "string" && /^v\d+:[0-9a-f]{64}$/.test(value);
}

/**
 * <MaskedField> — renders potentially-sensitive values (hashed IPs, hashed
 * emails, contact emails) truncated so raw PII is never fully exposed in admin
 * tables (AC7 data minimization).
 *
 *   - Versioned hashes (`v1:<64 hex>`) show as `v1:3f9a…c1` (never the full
 *     digest), with a `hashed` tag so it is clear the value is not raw PII.
 *   - Plain values (e.g. a partner contact email) are masked to the first few
 *     characters + a domain hint when it looks like an email.
 *
 * A value can never be "revealed" to a raw IP/email here — masking is the
 * point. `null`/empty renders a muted em dash.
 */
export interface MaskedFieldProps {
  value: string | null | undefined;
  /** How to treat the value: a hash, an email, or a generic sensitive string. */
  kind?: "hash" | "email" | "generic";
  className?: string;
}

function maskHash(value: string): string {
  // v1:3f9a…c1 — show the version tag + a short head/tail of the digest.
  const [version, digest] = value.split(":");
  if (!digest) return `${value.slice(0, 6)}…`;
  return `${version}:${digest.slice(0, 4)}…${digest.slice(-2)}`;
}

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return `${value.slice(0, 2)}…`;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export function MaskedField({
  value,
  kind = "generic",
  className,
}: MaskedFieldProps) {
  const [, setNoop] = useState(false);
  void setNoop;

  if (value == null || value === "") {
    return (
      <span className={cn("text-admin-ink-3", className)} data-masked="empty">
        —
      </span>
    );
  }

  const looksHashed = isHashed(value);
  let display: string;
  let tag: string | null = null;

  if (kind === "hash" || looksHashed) {
    display = looksHashed ? maskHash(value) : `${value.slice(0, 6)}…`;
    tag = "hashed";
  } else if (kind === "email") {
    display = maskEmail(value);
  } else {
    display =
      value.length > 8
        ? `${value.slice(0, 4)}…${value.slice(-2)}`
        : `${value.slice(0, 2)}…`;
  }

  return (
    <span
      className={cn("inline-flex items-center gap-1 font-mono text-xs", className)}
      data-masked={kind}
      title={tag ? "Hashed — raw value never stored" : "Masked"}
    >
      {display}
      {tag ? (
        <span className="rounded bg-admin-surface2 px-1 text-[10px] font-semibold uppercase tracking-wide text-admin-ink-3">
          {tag}
        </span>
      ) : null}
    </span>
  );
}
