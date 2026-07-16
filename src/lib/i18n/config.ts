export const locales = ["en", "tl"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie key used to persist the user's selected locale. */
export const LOCALE_COOKIE = "TULAY_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
