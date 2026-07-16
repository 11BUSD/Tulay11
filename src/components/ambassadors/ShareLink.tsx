"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

export interface ShareLinkProps {
  /** The ambassador referral code (e.g. the seeded SEED-AMB-01). */
  code: string;
}

/**
 * <ShareLink> — shows an ambassador's shareable deep link (`/r/<code>`) and a
 * copy-to-clipboard button. The absolute URL is derived from the current
 * origin on the client so it works in any environment.
 */
export function ShareLink({ code }: ShareLinkProps) {
  const t = useTranslations("ambassadors");
  const [href, setHref] = useState(`/r/${code}`);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHref(`${window.location.origin}/r/${code}`);
    }
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the link is still visible to copy manually.
    }
  }

  return (
    <div
      data-component-id="ambassador-share-link"
      className="rounded-lg border border-line bg-surface p-token-3"
    >
      <h2 className="text-lg font-semibold text-ink">{t("yourLinkTitle")}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t("yourLinkBody")}</p>
      <div className="mt-token-2 flex flex-wrap items-center gap-2">
        <code
          data-component-id="ambassador-link"
          className="flex-1 overflow-x-auto rounded-sm bg-surface-alt px-3 py-2 text-sm text-ink"
        >
          {href}
        </code>
        <Button data-component-id="ambassador-copy" onClick={() => void copy()}>
          {copied ? t("copyLink") + " ✓" : t("copyLink")}
        </Button>
      </div>
    </div>
  );
}

export default ShareLink;
