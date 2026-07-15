import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

/**
 * Placeholder landing page. The full marketing landing (matching the
 * `landing-warm-bridge` mockup) is built in a later task.
 */
export default async function HomePage() {
  const t = await getTranslations("landing");
  const common = await getTranslations("common");

  return (
    <AppShell>
      <section className="flex flex-col items-start gap-token-3 py-token-4">
        <h1 className="max-w-2xl text-4xl font-bold text-ink">
          {t("heading")}
        </h1>
        <p className="max-w-xl text-lg text-ink-soft">{t("subheading")}</p>
        <div className="flex gap-token-2">
          <Button size="lg">{common("getStarted")}</Button>
          <Button size="lg" variant="secondary">
            {common("learnMore")}
          </Button>
        </div>
        <Card className="mt-token-3 max-w-md">
          <CardTitle>{common("appName")}</CardTitle>
          <CardDescription>{common("tagline")}</CardDescription>
        </Card>
      </section>
    </AppShell>
  );
}
