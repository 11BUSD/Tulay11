/**
 * Send adapter: SimulatedSendProvider returns simulated:true and makes NO
 * network call (global fetch is spied and must not be invoked).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SimulatedSendProvider,
  getSendProvider,
} from "@/lib/outreach/send-adapter";

describe("SimulatedSendProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("dispatches simulated:true with a provider id and no network", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network disabled"));

    const logs: string[] = [];
    const provider = new SimulatedSendProvider((m) => logs.push(m));
    const res = await provider.send({
      id: "msg-1",
      toEmail: "x@example.com",
      subject: "Hi",
      body: "Body",
    });
    expect(res.simulated).toBe(true);
    expect(res.providerMessageId).toContain("sim-msg-1");
    expect(logs.some((l) => l.includes("SIMULATED SEND"))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("getSendProvider() returns the simulated provider (MVP)", async () => {
    expect(getSendProvider()).toBeInstanceOf(SimulatedSendProvider);
  });
});
