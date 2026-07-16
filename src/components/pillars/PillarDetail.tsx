"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/Skeleton";
import { OfferCard } from "@/components/offers/OfferCard";
import { LeadForm } from "@/components/leads/LeadForm";
import { RegulatedDisclaimer } from "@/components/disclosure/RegulatedDisclaimer";
import { getPillar, type Pillar, type DisclaimerDto } from "@/lib/api/pillars";
import {
  getRecommendations,
  type Recommendation,
} from "@/lib/api/offers";
import { saveItem, type SavedItem } from "@/lib/api/saved";
import { getSubjectRef } from "@/lib/api/subject";

type LoadState = "loading" | "ready" | "error";

const ICONS: Record<string, string> = {
  bank: "🏦",
  wifi: "📱",
  home: "🏠",
  shield: "🛡️",
  briefcase: "💼",
  heart: "🩺",
  receipt: "🧾",
  bus: "🚌",
  globe: "💸",
  users: "🤝",
};

export interface PillarDetailProps {
  slug: string;
}

/**
 * <PillarDetail> — per-pillar page: header + pillar disclaimer (when
 * regulated), the ranked offer feed (every card carries the partner
 * disclosure; regulated offers add the regulated disclaimer), and an aside
 * {@link LeadForm} that is gated by an explicit consent checkbox.
 */
export function PillarDetail({ slug }: PillarDetailProps) {
  const t = useTranslations("pillar");
  const [state, setState] = useState<LoadState>("loading");
  const [pillar, setPillar] = useState<Pillar | null>(null);
  const [disclaimer, setDisclaimer] = useState<DisclaimerDto | null>(null);
  const [offers, setOffers] = useState<Recommendation[]>([]);
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("loading");
      try {
        const [pillarRes, recs] = await Promise.all([
          getPillar(slug),
          getRecommendations({ pillar: slug }),
        ]);
        if (cancelled) return;
        setPillar(pillarRes.pillar);
        setDisclaimer(recs.disclaimer);
        setOffers(recs.recommendations);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleSave(offer: Recommendation) {
    try {
      const item: SavedItem = await saveItem({
        subjectRef: getSubjectRef(),
        offerId: offer.id,
        pillar: slug,
        title: offer.title,
        url: offer.destination_url ?? undefined,
      });
      setSavedIds((prev) => new Set(prev).add(offer.id));
      void item;
    } catch {
      // Non-blocking: a failed save leaves the button in its prior state.
    }
  }

  const regulatedDisclaimer =
    disclaimer && disclaimer.requires_licensed_referral
      ? {
          pillar: disclaimer.pillar,
          regulator: disclaimer.regulator,
          body: disclaimer.body,
          requires_licensed_referral: disclaimer.requires_licensed_referral,
        }
      : null;

  return (
    <div data-component-id="pillar-detail" data-slug={slug}>
      <nav className="mb-token-2 text-xs text-ink-muted">
        <Link href="/dashboard" className="text-brand underline">
          Dashboard
        </Link>{" "}
        / <span>{pillar?.name ?? slug}</span>
      </nav>

      {state === "loading" ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {state === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {t("loadError")}
        </p>
      ) : null}

      {state === "ready" && pillar ? (
        <>
          <header className="mb-token-3 flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-soft text-2xl"
            >
              {ICONS[pillar.icon ?? ""] ?? "•"}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-ink">{pillar.name}</h1>
              {pillar.description ? (
                <p className="mt-1 text-sm text-ink-soft">
                  {pillar.description}
                </p>
              ) : null}
            </div>
          </header>

          {regulatedDisclaimer ? (
            <RegulatedDisclaimer
              disclaimer={regulatedDisclaimer}
              routeHref="/concierge"
            />
          ) : null}

          <div className="mt-token-3 grid gap-token-3 md:grid-cols-[1fr_20rem]">
            <section>
              <h2 className="text-lg font-semibold text-ink">
                {t("recommendedOffers")}
              </h2>
              <p className="mb-token-2 text-sm text-ink-muted">
                {t("recommendedSub")}
              </p>

              {offers.length === 0 ? (
                <p
                  data-component-id="pillar-offers-empty"
                  className="rounded-lg border border-dashed border-line bg-surface p-token-3 text-sm text-ink-soft"
                >
                  {t("noOffers")}
                </p>
              ) : (
                <div className="flex flex-col gap-token-3">
                  {offers.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      disclaimer={{
                        pillar: disclaimer?.pillar ?? "general",
                        regulator: disclaimer?.regulator ?? null,
                        body: disclaimer?.body ?? "",
                        requires_licensed_referral:
                          disclaimer?.requires_licensed_referral ?? false,
                      }}
                      onSelect={setSelected}
                      onSave={handleSave}
                      saved={savedIds.has(offer.id)}
                      selected={selected?.id === offer.id}
                    />
                  ))}
                </div>
              )}
            </section>

            <aside>
              <LeadForm
                pillar={slug}
                offerId={selected?.id}
                partnerId={selected?.partner_id}
                partnerName={selected?.partner.name ?? "the partner"}
                offerTitle={selected?.title}
              />
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default PillarDetail;
