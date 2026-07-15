import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { JsonLd } from "@/components/content/JsonLd";
import { FAQS } from "@/content/faqs";

export const metadata: Metadata = {
  title: "Frequently asked questions — Tulay",
  description:
    "Answers to common newcomer questions about Tulay, banking, housing, health coverage and privacy in Ontario.",
};

export default function FaqsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <AppShell>
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">
        Frequently asked questions
      </h1>
      <p className="mt-token-2 max-w-xl text-ink-soft">
        General information for newcomers. For advice about your specific
        situation, we route you to a licensed professional.
      </p>
      <dl className="mt-token-4 max-w-2xl space-y-token-4">
        {FAQS.map((f) => (
          <div
            key={f.question}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <dt className="text-lg font-bold text-ink">{f.question}</dt>
            <dd className="mt-1 leading-relaxed text-ink-soft">{f.answer}</dd>
          </div>
        ))}
      </dl>
    </AppShell>
  );
}
