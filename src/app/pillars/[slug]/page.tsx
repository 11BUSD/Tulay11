import { AppShell } from "@/components/layout/AppShell";
import { PillarDetail } from "@/components/pillars/PillarDetail";

/**
 * Pillar detail route — offers + disclosures + lead form for a single pillar.
 * The slug is passed to {@link PillarDetail}, which fetches the pillar and its
 * ranked offer feed client-side.
 */
export default async function PillarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <AppShell>
      <PillarDetail slug={slug} />
    </AppShell>
  );
}
