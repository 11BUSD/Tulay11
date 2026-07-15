/**
 * Shared zod schemas for entities and route payloads.
 *
 * Route handlers parse their request body with these so every write is
 * validated at the edge. Kept in one module so the schemas are reused across
 * routes and tests rather than redefined ad hoc. Money fields are validated as
 * non-negative integers (cents) and percentages as integer basis points.
 */
import { z } from "zod";

/**
 * Lenient UUID string. Postgres `gen_random_uuid()` and our seed ids are
 * accepted by shape (8-4-4-4-12 hex) rather than by RFC-4122 version/variant
 * nibbles, since zod's strict `.uuid()` rejects some valid Postgres UUIDs (and
 * our fixed seed ids like `3333...`).
 */
export const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID",
  );

/** Non-negative integer cents. */
export const centsSchema = z.number().int().nonnegative();

/** Integer basis points in [0, 10000]. */
export const bpsSchema = z.number().int().min(0).max(10000);

/** Consent purposes (matches the compliance sub-plan). */
export const consentPurposeSchema = z.enum([
  "lead_referral",
  "concierge",
  "account",
  "partner_data_sharing",
  "marketing",
]);
export type ConsentPurpose = z.infer<typeof consentPurposeSchema>;

/** Consent legal basis (CASL). */
export const consentBasisSchema = z.enum(["express", "implied"]);
export type ConsentBasis = z.infer<typeof consentBasisSchema>;

/** POST /api/consent body. */
export const consentInputSchema = z
  .object({
    subjectId: z.string().uuid().nullish(),
    subjectEmail: z.string().email().nullish(),
    purpose: consentPurposeSchema,
    dataCategories: z.array(z.string()).default([]),
    sharedWith: z.string().nullish(),
    consequencesText: z.string().nullish(),
    consentTextVersion: z.string().min(1),
    basis: consentBasisSchema.default("express"),
    granted: z.boolean().default(true),
    userAgent: z.string().nullish(),
  })
  .refine((v) => v.subjectId != null || v.subjectEmail != null, {
    message: "Either subjectId or subjectEmail is required",
  });
export type ConsentInput = z.infer<typeof consentInputSchema>;

/** Data-request kinds. */
export const dataRequestKindSchema = z.enum(["export", "delete"]);
export type DataRequestKind = z.infer<typeof dataRequestKindSchema>;

/** POST /api/data-requests body. */
export const dataRequestInputSchema = z
  .object({
    subjectId: z.string().uuid().nullish(),
    subjectEmail: z.string().email().nullish(),
    kind: dataRequestKindSchema,
    /** User confirmed via emailed link (required before processing). */
    emailConfirmed: z.boolean().default(false),
    /** User re-authenticated (required before processing a delete). */
    reauthenticated: z.boolean().default(false),
  })
  .refine((v) => v.subjectId != null || v.subjectEmail != null, {
    message: "Either subjectId or subjectEmail is required",
  });
export type DataRequestInput = z.infer<typeof dataRequestInputSchema>;

// ---------------------------------------------------------------------------
// Consumer app (userapp) route payloads (Tasks 14-18)
// ---------------------------------------------------------------------------

/**
 * Embedded consent payload carried by a lead submission. Mirrors the columns of
 * a ConsentRecord so `POST /api/leads` can persist the full grant. `granted`
 * MUST be true for the lead to be accepted.
 */
export const leadConsentSchema = z.object({
  purpose: consentPurposeSchema.default("lead_referral"),
  dataCategories: z.array(z.string()).min(1),
  sharedWith: z.string().min(1),
  consequencesText: z.string().min(1),
  consentTextVersion: z.string().min(1),
  basis: consentBasisSchema.default("express"),
  granted: z.boolean(),
});
export type LeadConsentInput = z.infer<typeof leadConsentSchema>;

/** POST /api/leads body — a lead submission with an embedded consent grant. */
export const leadInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullish(),
  city: z.string().nullish(),
  pillar: z.string().min(1),
  offerId: uuidSchema.nullish(),
  partnerId: uuidSchema.nullish(),
  partnerName: z.string().nullish(),
  consent: leadConsentSchema,
});
export type LeadInput = z.infer<typeof leadInputSchema>;

/** POST /api/saved body — save an offer/resource for later. */
export const savedCreateSchema = z.object({
  subjectRef: z.string().min(1),
  offerId: uuidSchema.nullish(),
  pillar: z.string().nullish(),
  title: z.string().min(1),
  url: z.string().nullish(),
});
export type SavedCreateInput = z.infer<typeof savedCreateSchema>;

/** DELETE /api/saved body — remove a saved row. */
export const savedDeleteSchema = z.object({
  subjectRef: z.string().min(1),
  id: uuidSchema,
});
export type SavedDeleteInput = z.infer<typeof savedDeleteSchema>;

/** PATCH /api/profile body — update the editable profile fields. */
export const profileUpdateSchema = z
  .object({
    id: uuidSchema.optional(),
    displayName: z.string().min(1).nullish(),
    preferredLanguage: z.enum(["en", "tl"]).optional(),
    city: z.string().nullish(),
  })
  .refine(
    (v) =>
      v.displayName !== undefined ||
      v.preferredLanguage !== undefined ||
      v.city !== undefined,
    { message: "At least one field is required" },
  );
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** POST /api/concierge/chat body — a single concierge turn. */
export const conciergeChatSchema = z.object({
  message: z.string().min(1),
  /** Optional settlement-pillar slug the question is about. */
  pillar: z.string().nullish(),
  lang: z.enum(["en", "tl"]).default("en"),
});
export type ConciergeChatInput = z.infer<typeof conciergeChatSchema>;

/** Unsubscribe channels. */
export const unsubscribeChannelSchema = z.enum(["email", "sms", "all"]);
export type UnsubscribeChannel = z.infer<typeof unsubscribeChannelSchema>;

/** POST /api/unsubscribe body. */
export const unsubscribeInputSchema = z.object({
  email: z.string().email(),
  channel: unsubscribeChannelSchema.default("all"),
});
export type UnsubscribeInput = z.infer<typeof unsubscribeInputSchema>;

/** Commission type + rule shape (used by money/commission validation). */
export const commissionTypeSchema = z.enum([
  "fixed",
  "percentage",
  "recurring",
  "manual",
]);

export const commissionRuleSchema = z.object({
  commission_type: commissionTypeSchema,
  value_cents: centsSchema.nullish(),
  percentage_bps: bpsSchema.nullish(),
  recurring_interval: z.string().nullish(),
  recurring_max_periods: z.number().int().positive().nullish(),
  min_value_cents: centsSchema.nullish(),
  max_value_cents: centsSchema.nullish(),
});

// ---------------------------------------------------------------------------
// Partner / Offer OS route payloads (Task 6)
// ---------------------------------------------------------------------------

/** Partner lifecycle status (mirrors the `partner_status` enum). */
export const partnerStatusSchema = z.enum([
  "prospect",
  "contacted",
  "in_review",
  "active",
  "paused",
  "rejected",
]);

/** Offer surface type (mirrors the `offer_type` enum). */
export const offerTypeSchema = z.enum([
  "referral",
  "affiliate_link",
  "coupon",
  "manual_intro",
  "lead_form",
  "sponsored",
]);

/** POST /api/partners body — create a partner. */
export const partnerCreateSchema = z.object({
  name: z.string().min(1),
  category: z.string().nullish(),
  website: z.string().nullish(),
  contact_email: z.string().email().nullish(),
  phone: z.string().nullish(),
  location: z.string().nullish(),
  languages_supported: z.array(z.string()).default([]),
  newcomer_focus: z.boolean().default(false),
  filipino_focus: z.boolean().default(false),
  ontario_focus: z.boolean().default(false),
  licensed_required: z.boolean().default(false),
  license_type: z.string().nullish(),
  license_number: z.string().nullish(),
  regulator: z.string().nullish(),
  status: partnerStatusSchema.default("prospect"),
  notes: z.string().nullish(),
});
export type PartnerCreateInput = z.infer<typeof partnerCreateSchema>;

/** A license verification to append (writes a `license_verifications` row). */
export const licenseVerificationSchema = z.object({
  license_type: z.string().nullish(),
  license_number: z.string().nullish(),
  regulator: z.string().nullish(),
  method: z.string().nullish(),
  /** 'verified' sets partners.license_verified_at; other results do not. */
  result: z.enum(["verified", "failed", "expired"]),
  evidence_url: z.string().nullish(),
});
export type LicenseVerificationInput = z.infer<
  typeof licenseVerificationSchema
>;

/** PATCH /api/partners/[id] body — partial update + optional license check. */
export const partnerUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    category: z.string().nullish(),
    website: z.string().nullish(),
    contact_email: z.string().email().nullish(),
    phone: z.string().nullish(),
    location: z.string().nullish(),
    languages_supported: z.array(z.string()).optional(),
    newcomer_focus: z.boolean().optional(),
    filipino_focus: z.boolean().optional(),
    ontario_focus: z.boolean().optional(),
    licensed_required: z.boolean().optional(),
    license_type: z.string().nullish(),
    license_number: z.string().nullish(),
    regulator: z.string().nullish(),
    status: partnerStatusSchema.optional(),
    notes: z.string().nullish(),
    /** When present, append a license_verifications row via the compliance path. */
    license_verification: licenseVerificationSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });
export type PartnerUpdateInput = z.infer<typeof partnerUpdateSchema>;

/** POST /api/offers body — create an offer. */
export const offerCreateSchema = z.object({
  partner_id: uuidSchema,
  title: z.string().min(1),
  description: z.string().nullish(),
  settlement_pillar: z.string().min(1),
  offer_type: offerTypeSchema.default("referral"),
  destination_url: z.string().nullish(),
  tracking_code: z.string().min(1).nullish(),
  commission_type: commissionTypeSchema.default("fixed"),
  commission_value_cents: centsSchema.default(0),
  user_reward_value_cents: centsSchema.default(0),
  eligibility_rules: z.record(z.string(), z.unknown()).default({}),
  city_targets: z.array(z.string()).default([]),
  language_targets: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  priority_score: z.number().int().default(0),
  compliance_notes: z.string().nullish(),
  status: z.enum(["pending", "live", "paused"]).default("live"),
});
export type OfferCreateInput = z.infer<typeof offerCreateSchema>;

/** PATCH /api/offers/[id] body — partial update. */
export const offerUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullish(),
    settlement_pillar: z.string().min(1).optional(),
    offer_type: offerTypeSchema.optional(),
    destination_url: z.string().nullish(),
    tracking_code: z.string().min(1).nullish(),
    commission_type: commissionTypeSchema.optional(),
    commission_value_cents: centsSchema.optional(),
    user_reward_value_cents: centsSchema.optional(),
    eligibility_rules: z.record(z.string(), z.unknown()).optional(),
    city_targets: z.array(z.string()).optional(),
    language_targets: z.array(z.string()).optional(),
    active: z.boolean().optional(),
    priority_score: z.number().int().optional(),
    compliance_notes: z.string().nullish(),
    status: z.enum(["pending", "live", "paused"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });
export type OfferUpdateInput = z.infer<typeof offerUpdateSchema>;

/** POST /api/attribution body — record a revenue attribution event. */
export const attributionInputSchema = z.object({
  event_type: z.enum(["click", "conversion", "payout", "manual"]),
  partner_id: uuidSchema.nullish(),
  partner_offer_id: uuidSchema.nullish(),
  conversion_id: uuidSchema.nullish(),
  ambassador_id: uuidSchema.nullish(),
  amount_cents: centsSchema.default(0),
  currency: z.string().default("CAD"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AttributionInput = z.infer<typeof attributionInputSchema>;

// ---------------------------------------------------------------------------
// Referral / conversion / payout route payloads (Task 7)
// ---------------------------------------------------------------------------

/** POST /api/referrals/conversion body. */
export const conversionInputSchema = z.object({
  referral_id: z.string().min(1),
  partner_id: uuidSchema.nullish(),
  /** Free-text conversion type; 'lead_form' variants require a consent record. */
  conversion_type: z.string().min(1),
  conversion_value_cents: centsSchema.default(0),
  /** Idempotency key → stored as external_conversion_id. */
  external_reference: z.string().min(1).nullish(),
  /** Consent subject (needed for lead_form conversions). */
  subject_id: uuidSchema.nullish(),
  subject_email: z.string().email().nullish(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ConversionInput = z.infer<typeof conversionInputSchema>;

/** PATCH /api/payouts/[id]/status body — state machine transition. */
export const payoutStatusUpdateSchema = z.object({
  status: z.enum(["pending", "approved", "paid", "rejected"]),
  notes: z.string().nullish(),
  external_ref: z.string().nullish(),
});
export type PayoutStatusUpdateInput = z.infer<
  typeof payoutStatusUpdateSchema
>;

/** POST /api/payouts/[id]/splits body — create an ambassador split payout. */
export const payoutSplitSchema = z.object({
  ambassador_id: uuidSchema.nullish(),
  /** Override split; defaults to the ambassador's split_percentage_bps. */
  split_bps: bpsSchema.nullish(),
  notes: z.string().nullish(),
});
export type PayoutSplitInput = z.infer<typeof payoutSplitSchema>;

// ---------------------------------------------------------------------------
// Agent + outreach route payloads (Task 13)
// ---------------------------------------------------------------------------

/** POST /api/outreach/import body — CSV text + optional campaign. */
export const outreachImportSchema = z.object({
  csv: z.string().min(1),
  campaign_id: uuidSchema.nullish(),
});
export type OutreachImportInput = z.infer<typeof outreachImportSchema>;

/** POST /api/agents/run body — trigger an agent run. */
export const agentRunSchema = z.object({
  agent_key: z.string().min(1),
  input: z.unknown(),
  entity_id: z.string().nullish(),
  related_partner_id: uuidSchema.nullish(),
  related_contact_id: uuidSchema.nullish(),
  related_campaign_id: uuidSchema.nullish(),
});
export type AgentRunInput = z.infer<typeof agentRunSchema>;

/** POST /api/agents/tick body — cron drain. */
export const agentTickSchema = z.object({
  limit: z.number().int().positive().max(50).default(5),
});
export type AgentTickInput = z.infer<typeof agentTickSchema>;

/** POST /api/outreach/messages/[id]/reject body. */
export const outreachRejectSchema = z.object({
  reason: z.string().min(1),
});
export type OutreachRejectInput = z.infer<typeof outreachRejectSchema>;

/** POST /api/outreach/replies body — log a reply. */
export const outreachReplySchema = z.object({
  message_id: uuidSchema,
  body: z.string().nullish(),
  meeting_booked: z.boolean().default(false),
});
export type OutreachReplyInput = z.infer<typeof outreachReplySchema>;
