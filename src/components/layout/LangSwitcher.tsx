"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { locales, type Locale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Toggles the active locale by persisting a cookie and refreshing the route so
 * the server re-renders with the new message bundle.
 */
export function LangSwitcher({ className }: { className?: string }) {
  const activeLocale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");

  function selectLocale(locale: Locale) {
    if (locale === activeLocale) return;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  const labels: Record<Locale, string> = {
    en: t("english"),
    tl: t("tagalog"),
  };

  return (
    <div
      role="group"
      aria-label={t("language")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1",
        className,
      )}
    >
      {locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <button
            key={locale}
            type="button"
            aria-pressed={isActive}
            onClick={() => selectLocale(locale)}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition-colors",
              isActive ? "bg-brand text-white" : "text-ink-soft hover:text-ink",
            )}
          >
            {locale.toUpperCase()}
            <span className="sr-only"> — {labels[locale]}</span>
          </button>
        );
      })}
    </div>
  );
}
