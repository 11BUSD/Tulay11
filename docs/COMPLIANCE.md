# Tulay — Compliance & Launch Readiness

> **Engineering guardrails, not legal advice.** This document describes the
> technical controls Tulay's code enforces to support compliance with PIPEDA,
> CASL, and Ontario sectoral regulation (FSRA and others). It is written by
> engineering to document how the system behaves — it is **not** legal advice
> and does not replace review by qualified counsel.

## Launch-readiness checklist

`src/lib/compliance/launchChecklist.ts` exports `runLaunchReadiness()`, which
runs each control below as a concrete probe against the shipped code/config and
returns a structured result: **pass/fail per control plus an overall gate**.
The gate `ready` is `true` **only when every control passes** — any single
failure blocks launch (`ready=false`, with the failing control ids listed).

The Compliance/Privacy agent (`src/lib/agents/impl/compliance-privacy.ts`) runs
the automated portion of this checklist and emits the report as a **draft** for
a human to review. Agents never sign off a launch themselves.

| # | Control | Regime | How it is enforced |
| --- | --- | --- | --- |
| 1 | **Consent clarity + versioning** | PIPEDA | `buildLeadConsent()` produces a payload with a bumped `consentTextVersion` (`LEAD_CONSENT_VERSION`) and clear, named-partner, withdrawable copy. The consent ledger records which wording version the user agreed to. |
| 2 | **Privacy / affiliate disclosure reachable** | PIPEDA | `getDisclaimer("general")` returns non-empty affiliate-disclosure copy that renders on monetized surfaces. |
| 3 | **Partner data-sharing consent enforced (lead flow)** | PIPEDA | Lead consent captures an **express** basis, the **named** partner, and the **shared data categories**; `POST /api/leads` rejects a lead when the explicit consent checkbox is not `true`. |
| 4 | **CASL controls live** | CASL | The approval gate (`approvalGate.ts`) blocks sending an unapproved draft (`assertApprovedBeforeSend` throws), requires a **human** approver id (`approveOutreach` rejects a blank approver), and honours unsubscribes. One-click unsubscribe is wired at `GET /api/unsubscribe`. |
| 5 | **Regulated-advice boundaries** | FSRA (+ CICC/OSC/CRA/LSO) | Every regulated pillar sets `requiresLicensedReferral=true`, so the recommendations feed filters to **license-verified partners only** (`partners.license_verified_at`). The content guardrail (`contentGuardrails.ts`) blocks fabricated regulatory-status/advice claims. Regulated topics route to a licensed professional. |
| 6 | **Data minimization / IP + email hashing** | Security / PIPEDA | IPs and emails are stored **hashed** (`hashing.ts`, version-prefixed `v1:`); raw identifiers are never persisted. Admin views mask sensitive values. |
| 7 | **Audit coverage** | Governance | `recordAudit()` writes an append-only `audit_logs` row in the same transaction as every state change (consent, approval, payout, license verification). |
| 8 | **Data-subject export / delete** | PIPEDA | `dataRequests.ts` implements verification-gated `createDataRequest` / `processExport` / `processDelete`, exposed via `POST /api/data-requests`. |

The checklist probes are **injectable** so tests can simulate a broken/missing
control and assert the gate fails — see
`src/lib/compliance/launchChecklist.test.ts`.

## Regulated-advice boundary

Tulay does **not** provide regulated advice — mortgage/insurance/credit
(FSRA), legal (Law Society of Ontario), immigration (CICC/RCIC), tax (CRA), or
investment (OSC). On these surfaces the code:

1. Renders the appropriate **licensing disclaimer** (`RegulatedDisclaimer`,
   driven by `getDisclaimer(pillar)` — never hardcoded copy), naming the
   regulator and stating Tulay is not the licensed provider.
2. Surfaces only partners whose **license is verified** for regulated pillars.
3. Routes the user to a **licensed professional** for advice specific to their
   situation.

Content pages (guides, cities, FAQs) and concierge output are informational
only, link to **official sources** (Canada.ca, Ontario.ca, FSRA, CRA, IRCC),
and never give regulated advice.

## Monetization disclosure

Every monetized/offer block renders the **partner-disclosure** component
(affiliate/referral-fee disclosure). This is enforced structurally: the shared
`ContentOfferBlock` always renders `PartnerDisclosure`, and regulated pillars
additionally render the licensing disclaimer.

## Immutability & integrity guarantees (never weakened)

- **Paid payouts are immutable** and the revenue/consent/approval ledgers are
  **append-only** (enforced by DB triggers in migration 0009).
- **Agents emit drafts only.** All outbound outreach requires a human approval
  before sending, and the MVP send is **simulated** (no network egress).
- **Consent is append-only**: a withdrawal is a new row; effective consent is
  the latest row.

## Regulatory notes

- **PIPEDA:** consent is meaningful (purpose, data categories, named recipient,
  consequences), withdrawable, versioned, and auditable; data minimization via
  hashing; export/delete rights implemented.
- **CASL:** express vs. implied consent tracked with implied-consent expiry;
  one-click unsubscribe in every message; a human-gated approval before any
  send; no cold sending without a lawful basis.
- **FSRA / sectoral:** no regulated advice; licensing disclaimers; verified-
  license filtering for regulated referrals.

_Again: these are engineering controls documented for transparency, not legal
advice. Confirm obligations with qualified counsel before launch._
