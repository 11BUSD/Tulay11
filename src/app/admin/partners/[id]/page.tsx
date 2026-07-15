import { PartnerDetailView } from "@/components/admin/PartnerDetailView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PartnerDetailView partnerId={id} />;
}
