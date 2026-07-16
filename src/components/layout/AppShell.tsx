import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LangSwitcher } from "./LangSwitcher";

/**
 * Consumer app shell: header with brand + language switcher, main content
 * area, and a footer. Server component so it can read translations.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("common");

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link
            href="/"
            className="text-lg font-semibold text-brand"
            aria-label={t("appName")}
          >
            {t("appName")}
          </Link>
          <LangSwitcher />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-token-4">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-3 text-sm text-ink-muted">
          {t("appName")} — {t("tagline")}
        </div>
      </footer>
    </div>
  );
}
