/**
 * Deterministic idempotency-key derivation for agent runs/tasks.
 *
 * Kept in its own module (no imports of the registry/runner) so agent
 * implementations can compute chained-task keys without creating an import
 * cycle through the runner (runner -> registry -> agent impl -> runner).
 */
import { createHash } from "node:crypto";

/** Deterministic idempotency key = hash(agentKey + entityId + inputHash). */
export function computeIdempotencyKey(
  agentKey: string,
  entityId: string | null | undefined,
  input: unknown,
): string {
  const inputHash = createHash("sha256")
    .update(stableStringify(input))
    .digest("hex");
  return createHash("sha256")
    .update(`${agentKey}::${entityId ?? ""}::${inputHash}`)
    .digest("hex");
}

/** Stable JSON stringify (sorted keys) so idempotency is order-insensitive. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
