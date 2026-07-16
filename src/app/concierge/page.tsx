import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/AppShell";
import { Chat } from "@/components/concierge/Chat";

/**
 * Concierge route — the AI settlement chat. The client {@link Chat} component
 * enforces the UI-side regulated-advice boundary (persistent disclaimer +
 * route-to-a-licensed-pro handoff), mirroring the server-side guardrail.
 */
export default async function ConciergePage() {
  const t = await getTranslations("concierge");
  return (
    <AppShell>
      <h1 className="mb-token-3 text-2xl font-bold text-ink">{t("title")}</h1>
      <Chat />
    </AppShell>
  );
}
