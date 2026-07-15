"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Skeleton } from "@/components/ui/Skeleton";
import { PillarGrid } from "./PillarGrid";
import { listPillars, type Pillar } from "@/lib/api/pillars";

type LoadState = "loading" | "ready" | "error";

/**
 * <DashboardView> — client dashboard that loads the settlement pillars from
 * `GET /api/pillars` and renders the greeting header, an overall progress bar,
 * and the "Your 10 pillars" grid. Handles loading (skeleton), error (retry),
 * and empty states.
 */
export function DashboardView() {
  const t = useTranslations("dashboard");
  const [state, setState] = useState<LoadState>("loading");
  const [pillars, setPillars] = useState<Pillar[]>([]);

  async function load() {
    setState("loading");
    try {
      const res = await listPillars();
      setPillars(res.pillars);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const total = pillars.length;
  const started = pillars.filter(
    (p) => p.progress.status !== "not_started",
  ).length;
  const overall =
    total === 0
      ? 0
      : Math.round(
          pillars.reduce((sum, p) => sum + p.progress.percent, 0) / total,
        );

  return (
    <div data-component-id="dashboard" className="mx-auto max-w-2xl">
      <header className="mb-token-3">
        <h1 className="text-2xl font-bold text-ink">{t("greeting")}</h1>
      </header>

      {state === "loading" ? (
        <div data-component-id="dashboard-loading" className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}

      {state === "error" ? (
        <div
          data-component-id="dashboard-error"
          role="alert"
          className="rounded-lg border border-line bg-surface p-token-3"
        >
          <p className="text-sm text-ink-soft">{t("loadError")}</p>
          <Button className="mt-token-2" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {state === "ready" ? (
        <>
          <section
            data-component-id="dashboard-progress"
            className="mb-token-3 rounded-lg border border-line bg-surface p-token-3"
          >
            <p className="text-sm font-medium text-ink">{t("progressTitle")}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {t("pillarsStarted", { started, total })}
            </p>
            <Progress
              value={overall}
              label={t("progressTitle")}
              className="mt-token-2"
            />
          </section>

          <h2 className="mb-token-2 text-lg font-semibold text-ink">
            {t("yourPillars")}
          </h2>
          <PillarGrid pillars={pillars} />
        </>
      ) : null}
    </div>
  );
}

export default DashboardView;
