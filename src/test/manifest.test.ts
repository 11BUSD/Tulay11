/**
 * PWA manifest + service-worker presence tests (Task 22).
 *
 * Asserts `public/manifest.json` is a valid installable web app manifest —
 * required fields present, `display: standalone`, and icons covering at least
 * 192x192 and 512x512 (incl. a maskable icon) — and that the SW source
 * (`src/sw.ts`) and offline fallback (`public/offline.html`) exist. Lighthouse
 * / Playwright installability is out of scope for the sandbox; a schema + SW
 * presence check is the deterministic equivalent.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}
interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

function loadManifest(): Manifest {
  const raw = readFileSync(`${root}public/manifest.json`, "utf8");
  return JSON.parse(raw) as Manifest;
}

describe("PWA web app manifest", () => {
  it("has the required installability fields", () => {
    const m = loadManifest();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe("/");
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();
    expect(Array.isArray(m.icons)).toBe(true);
  });

  it("uses display: standalone", () => {
    expect(loadManifest().display).toBe("standalone");
  });

  it("uses the brand teal/cream colors", () => {
    const m = loadManifest();
    expect(m.theme_color.toLowerCase()).toBe("#0e7c6b");
    expect(m.background_color.toLowerCase()).toBe("#fbf7f1");
  });

  it("includes at least 192x192 and 512x512 icons", () => {
    const sizes = loadManifest().icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("includes a maskable icon", () => {
    const maskable = loadManifest().icons.some((i) =>
      (i.purpose ?? "").split(" ").includes("maskable"),
    );
    expect(maskable).toBe(true);
  });

  it("references icon files that exist on disk", () => {
    for (const icon of loadManifest().icons) {
      expect(existsSync(`${root}public${icon.src}`)).toBe(true);
    }
  });
});

describe("PWA service worker + offline shell", () => {
  it("ships a Serwist service-worker source", () => {
    expect(existsSync(`${root}src/sw.ts`)).toBe(true);
    const sw = readFileSync(`${root}src/sw.ts`, "utf8");
    expect(sw).toContain("new Serwist");
    // Network-first for our own API GETs.
    expect(sw).toContain("NetworkFirst");
  });

  it("ships an offline fallback document", () => {
    expect(existsSync(`${root}public/offline.html`)).toBe(true);
    const html = readFileSync(`${root}public/offline.html`, "utf8");
    expect(html.toLowerCase()).toContain("offline");
  });
});
