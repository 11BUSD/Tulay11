/**
 * <JsonLd> — renders a `<script type="application/ld+json">` block with the
 * given structured-data object. Used by the SEO content pages to emit Article
 * (guides/cities) and FAQPage (FAQ) schema.
 *
 * The JSON is serialized server-side; `<` is escaped to prevent it from ever
 * closing the script tag early.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      data-testid="jsonld"
      // Structured data is static/derived from our own content (no user input).
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

export default JsonLd;
