import { AdminBadge } from "./AdminBadge";

/**
 * <LicensingBadge> — renders a partner's licensing state as a badge:
 * verified (green) / unverified (amber) for regulated partners, or "n/a" for
 * partners that do not require a licence. Shared by the partners list and the
 * applications review so the licence-gate signal reads identically in both.
 */
export function LicensingBadge({
  licensedRequired,
  licenseVerifiedAt,
}: {
  licensedRequired: boolean;
  licenseVerifiedAt: string | null;
}) {
  if (!licensedRequired) {
    return <span className="text-admin-ink-3">n/a</span>;
  }
  return licenseVerifiedAt ? (
    <AdminBadge tone="green">Verified</AdminBadge>
  ) : (
    <AdminBadge tone="amber">Unverified</AdminBadge>
  );
}
