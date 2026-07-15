/**
 * Launch-readiness checklist tests (Task 24).
 *
 * The checklist must PASS on the current healthy build (all controls green,
 * `ready=true`), and must FAIL + BLOCK (`ready=false`) when any single control
 * is broken/missing — simulated by injecting a failing probe.
 */
import { describe, expect, it } from "vitest";
import { runLaunchReadiness } from "./launchChecklist";

describe("runLaunchReadiness", () => {
  it("passes (ready=true) on the current healthy build", async () => {
    const result = await runLaunchReadiness();
    expect(result.ready).toBe(true);
    expect(result.failed).toBe(0);
    expect(result.failedControls).toEqual([]);
    expect(result.passed).toBe(result.controls.length);
    expect(result.controls.every((c) => c.passed)).toBe(true);
  });

  it("reports concrete controls with regimes", async () => {
    const result = await runLaunchReadiness();
    const ids = result.controls.map((c) => c.id);
    expect(ids).toContain("consent-versioning");
    expect(ids).toContain("casl-controls");
    expect(ids).toContain("regulated-advice-boundary");
    expect(ids).toContain("data-minimization-hashing");
    expect(ids).toContain("export-delete");
    for (const c of result.controls) {
      expect(c.detail.length).toBeGreaterThan(0);
    }
  });

  it("FAILS + BLOCKS when a single control is broken", async () => {
    const result = await runLaunchReadiness({
      regulatedAdviceBoundary: () => ({
        passed: false,
        detail: "simulated broken regulated-advice boundary",
      }),
    });
    expect(result.ready).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.failedControls).toContain("regulated-advice-boundary");
  });

  it("blocks when a probe throws (missing control)", async () => {
    const result = await runLaunchReadiness({
      exportDelete: () => {
        throw new Error("export/delete module missing");
      },
    });
    expect(result.ready).toBe(false);
    expect(result.failedControls).toContain("export-delete");
    const control = result.controls.find((c) => c.id === "export-delete");
    expect(control?.detail).toMatch(/threw/i);
  });

  it("blocks when consent versioning is missing", async () => {
    const result = await runLaunchReadiness({
      consentVersioning: () => ({
        passed: false,
        detail: "no consent version",
      }),
    });
    expect(result.ready).toBe(false);
    expect(result.failedControls).toEqual(["consent-versioning"]);
  });
});
