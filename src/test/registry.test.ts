/**
 * Registry completeness: all 14 canonical agent keys are registered, each maps
 * to an Agent implementing the interface, and lookups behave.
 */
import { describe, expect, it } from "vitest";
import {
  AGENT_KEYS,
  getAgent,
  hasAgent,
  listAgentKeys,
  listAgents,
} from "@/lib/agents/registry";

describe("agent registry", () => {
  it("registers exactly the 14 canonical keys", () => {
    expect(AGENT_KEYS).toHaveLength(14);
    const registered = listAgentKeys().sort();
    expect(registered).toEqual([...AGENT_KEYS].sort());
  });

  it("every registered agent implements the interface", () => {
    for (const agent of listAgents()) {
      expect(typeof agent.key).toBe("string");
      expect(typeof agent.version).toBe("string");
      expect(agent.inputSchema).toBeDefined();
      expect(typeof agent.run).toBe("function");
    }
  });

  it("getAgent resolves + throws on unknown", () => {
    expect(getAgent("due-diligence").key).toBe("due-diligence");
    expect(hasAgent("nope")).toBe(false);
    expect(() => getAgent("nope")).toThrow(/Unknown agent key/);
  });
});
