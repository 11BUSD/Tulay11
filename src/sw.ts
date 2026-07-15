/**
 * Tulay service worker (Serwist).
 *
 * Precaches the built app shell (Serwist injects `self.__SW_MANIFEST` at build
 * time), then applies runtime caching:
 *   - static assets (fonts/images/icons) → cache-first,
 *   - read-only GET pages (navigations) → network-first with an offline
 *     fallback (`/offline.html`),
 *   - `/api/*` GETs → network-first (fresh data preferred, cached fallback for
 *     brief connectivity blips). Non-GET API calls are never cached.
 *
 * Mutations and authenticated/admin traffic are intentionally NOT cached; the
 * SW only ever serves cached responses for idempotent GETs, so it can never
 * replay a stale write or leak admin data offline.
 */
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  NetworkFirst,
  Serwist,
  ExpirationPlugin,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = "/offline.html";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Network-first for our own read-only API GETs.
    {
      matcher: ({ url, request, sameOrigin }) =>
        sameOrigin &&
        request.method === "GET" &&
        url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "tulay-api",
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 5 * 60,
          }),
        ],
      }),
    },
    // Cache-first for static assets (icons, images, fonts).
    {
      matcher: ({ request }) =>
        ["image", "font", "style"].includes(request.destination),
      handler: new CacheFirst({
        cacheName: "tulay-static",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 128,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    // Everything else falls through to Serwist's tuned defaults (which
    // network-first navigations, etc.).
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_URL,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
