import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Resolves the active locale (from the persisted cookie, defaulting to `en`)
 * and loads its message bundle. Consumed by the next-intl plugin.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  const messages = (await import(`../../../messages/${locale}.json`)).default;

  return { locale, messages };
});
