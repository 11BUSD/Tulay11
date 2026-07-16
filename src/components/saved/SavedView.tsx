"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { listSaved, removeSaved, type SavedItem } from "@/lib/api/saved";
import { getSubjectRef } from "@/lib/api/subject";

type LoadState = "loading" | "ready" | "error";

/**
 * <SavedView> — the saved-offers list. Loads the current browser's saved items
 * (keyed by an opaque subject ref) and lets the user remove them.
 */
export function SavedView() {
  const t = useTranslations("saved");
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<SavedItem[]>([]);

  async function load() {
    setState("loading");
    try {
      const res = await listSaved(getSubjectRef());
      setItems(res.saved);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRemove(id: string) {
    try {
      await removeSaved({ subjectRef: getSubjectRef(), id });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // Non-blocking.
    }
  }

  return (
    <div data-component-id="saved-view" className="mx-auto max-w-2xl">
      <h1 className="mb-token-3 text-2xl font-bold text-ink">{t("title")}</h1>

      {state === "loading" ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {state === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {t("empty")}
        </p>
      ) : null}

      {state === "ready" && items.length === 0 ? (
        <p
          data-component-id="saved-empty"
          className="rounded-lg border border-dashed border-line bg-surface p-token-3 text-sm text-ink-soft"
        >
          {t("empty")}
        </p>
      ) : null}

      {state === "ready" && items.length > 0 ? (
        <ul data-component-id="saved-list" className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              data-component-id={`saved-item-${item.id}`}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface p-token-2"
            >
              <span className="flex-1">
                <span className="block font-semibold text-ink">
                  {item.title}
                </span>
                {item.pillar ? (
                  <Link
                    href={`/pillars/${item.pillar}`}
                    className="block text-xs text-brand underline"
                  >
                    {item.pillar}
                  </Link>
                ) : null}
              </span>
              <Button
                size="sm"
                variant="ghost"
                data-component-id="saved-remove"
                onClick={() => void handleRemove(item.id)}
              >
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default SavedView;
