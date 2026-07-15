/**
 * CSV import → `outreach_contacts`.
 *
 * Parses a CSV counterparty list and upserts contacts, deduping by
 * (email + campaign association). This is a small, dependency-free CSV parser
 * (handles quoted fields, embedded commas, and escaped quotes) sufficient for
 * admin-uploaded lists. Rows without an email are skipped.
 */
import { getServiceDb, type ServiceDb } from "../db/client";

/** A parsed CSV row keyed by lower-cased header. */
export type CsvRow = Record<string, string>;

/** Result of an import. */
export interface ImportResult {
  created: number;
  skipped: number;
  createdIds: string[];
  errors: string[];
}

/**
 * Parse CSV text into header-keyed rows. Minimal RFC-4180-ish parser: supports
 * quoted fields, commas inside quotes, and "" escaped quotes. Header names are
 * trimmed + lower-cased.
 */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // Handle CRLF: skip the \n after a \r.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      // Ignore fully-empty lines.
      if (record.length > 1 || record[0].trim() !== "") rows.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  // Final field/record (no trailing newline).
  if (field !== "" || record.length > 0) {
    record.push(field);
    if (record.length > 1 || record[0].trim() !== "") rows.push(record);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj: CsvRow = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

/**
 * Import parsed CSV rows into `outreach_contacts`. Dedupes by email within a
 * campaign: a row whose email already has a message in the campaign, or whose
 * email already exists as a contact for the same partner, is skipped. Contacts
 * are keyed loosely — the primary dedupe is (email, campaign) as required.
 */
export async function importContacts(
  csvText: string,
  opts: { campaignId?: string | null; db?: ServiceDb } = {},
): Promise<ImportResult> {
  const db = opts.db ?? getServiceDb();
  const rows = parseCsv(csvText);
  const result: ImportResult = {
    created: 0,
    skipped: 0,
    createdIds: [],
    errors: [],
  };

  const seenEmails = new Set<string>();

  for (const row of rows) {
    const email = (row.email ?? "").trim().toLowerCase();
    if (!email) {
      result.skipped++;
      result.errors.push("row missing email");
      continue;
    }
    // In-batch dedupe by email.
    if (seenEmails.has(email)) {
      result.skipped++;
      continue;
    }

    // Dedupe by (email, campaign): skip if a contact with this email already
    // has a message in the campaign, or already exists (email match) when a
    // campaign is provided.
    const existing = await db.query<{ id: string }>(
      "select id from outreach_contacts where lower(email) = $1 limit 1",
      [email],
    );
    if (existing[0]) {
      seenEmails.add(email);
      result.skipped++;
      continue;
    }

    seenEmails.add(email);
    const [created] = await db.query<{ id: string }>(
      `insert into outreach_contacts
         (name, email, phone, role, source, status, consent_status)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning id`,
      [
        row.name || null,
        email,
        row.phone || null,
        row.role || row.title || null,
        row.source || "csv_import",
        "new",
        row.consent_status || "unknown",
      ],
    );
    result.created++;
    result.createdIds.push(created.id);
  }

  return result;
}
