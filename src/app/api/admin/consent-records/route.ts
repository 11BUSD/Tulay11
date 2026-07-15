/**
 * GET /api/admin/consent-records — read the append-only consent ledger.
 *
 * Admin-only. The consent model is append-only: a withdrawal is a NEW row with
 * `granted=false`, so the CURRENT state of a subject+purpose is the latest row.
 * By default this returns the latest-per-(subject, purpose) rows; pass
 * `?all=true` to return the full history. Filters: `?purpose=`.
 *
 * PII minimization (AC7): `subject_email_hash` and `ip_hash` are already stored
 * hashed and returned as-is; no raw email/IP ever lives in this table.
 */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin-guard";
import { getServiceDb } from "@/lib/db/client";
import { buildWhere, handleRouteError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const purpose = url.searchParams.get("purpose");
    const all = url.searchParams.get("all") === "true";
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1),
      500,
    );

    const { where, params } = buildWhere([["purpose", purpose]]);

    const cols = `id, subject_id, subject_email_hash, purpose, data_categories,
                  shared_with, consent_text_version, basis, granted, ip_hash,
                  created_at`;

    // Latest-per-(subject, purpose): the current state under the append-only
    // model. `all=true` returns the full history instead.
    const sql = all
      ? `select ${cols} from consent_records ${where}
           order by created_at desc limit ${limit}`
      : `select ${cols} from (
             select ${cols},
                    row_number() over (
                      partition by coalesce(subject_id::text, subject_email_hash), purpose
                      order by created_at desc
                    ) as rn
               from consent_records ${where}
           ) latest
          where rn = 1
          order by created_at desc
          limit ${limit}`;

    const rows = await getServiceDb().query(sql, params);
    return NextResponse.json({ records: rows, latestPerSubject: !all });
  } catch (err) {
    return handleRouteError(err);
  }
}
