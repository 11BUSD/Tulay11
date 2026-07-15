"use client";

import { useEffect } from "react";

/**
 * <ServiceWorkerRegister> — registers the Serwist-built service worker
 * (`/sw.js`) on the client after the page loads. Mounted once in the root
 * layout.
 *
 * Registration is a no-op in development (where Serwist is `disable`d and no
 * `/sw.js` is emitted) and when the browser has no Service Worker support, so
 * the dev server / unsupported browsers are never affected. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures must never break the app; swallow silently.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

export default ServiceWorkerRegister;
