/**
 * Shared zod schemas for entities and route payloads.
 *
 * Route handlers parse their request body with these so every write is
 * validated at the edge. Kept in one module so the schemas are reused across
 * routes and tests rather than redefined ad hoc. Money fields are validated as
 * non-negative integers (cents) and percentages as integer basis points.
 */
import { z } from "zod";

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
