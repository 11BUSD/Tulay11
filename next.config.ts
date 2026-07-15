import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

// Serwist (PWA service worker). The SW source is compiled from `src/sw.ts` and
// emitted to `public/sw.js`. Disabled in development so it never interferes
// with hot-reload / the dev server (the manifest + install prompt still work).
const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Don't auto-register; we register from a client component so registration
  // stays in our control (and is scoped/guarded).
  register: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// Compose both plugins: next-intl (i18n request config) wrapped by Serwist.
export default withSerwist(withNextIntl(nextConfig));
