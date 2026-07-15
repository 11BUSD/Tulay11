import { OfferForm } from "@/components/admin/OfferForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminNewOfferPage() {
  return <OfferForm mode={{ kind: "new" }} />;
}
