/**
 * Compliance / Privacy agent.
 *
 * Runs the automated portion of the launch-readiness review by calling
 * `runLaunchReadiness()` and emitting a structured report as a DRAFT for a
 * human to review — the agent never approves or "signs off" a launch itself.
 * It performs no side effects beyond an audit row noting the run and its
 * pass/fail summary.
 *
 * The result carries `status: 'needs_review'` (a human must accept the report)
 * and surfaces any failed control as a high-severity risk flag so a red gate is
 * impossible to miss.
 */
import { z } from "zod";
import type { Agent, AgentContext, AgentResult, RiskFlag } from "../types";
import {
  runLaunchReadiness,
  type LaunchReadinessResult,
} from "@/lib/compliance/launchChecklist";

/** No input required — the checklist reads the shipped code/config. */
export const compliancePrivacyInput = z.object({}).passthrough();

export interface CompliancePrivacyOutput {
  report: LaunchReadinessResult;
}

export const compliancePrivacyAgent: Agent<
  Record<string, unknown>,
  CompliancePrivacyOutput
> = {
  key: "compliance-privacy",
  version: "1.0.0",
  inputSchema: compliancePrivacyInput,
  async run(
    ctx: AgentContext,
  ): Promise<AgentResult<CompliancePrivacyOutput>> {
    const report = await runLaunchReadiness({ db: ctx.db });

    const riskFlags: RiskFlag[] = report.failedControls.map((id) => ({
      code: `launch_control_failed:${id}`,
      severity: "high",
      message: `Launch-readiness control '${id}' failed — blocks launch.`,
    }));

    const summary = report.ready
      ? `Launch readiness PASS: all ${report.passed} controls green.`
      : `Launch readiness BLOCKED: ${report.failed} of ${report.controls.length} controls failed (${report.failedControls.join(", ")}).`;

    await ctx.audit({
      action: "compliance.launch_readiness_reviewed",
      entityType: "agent_runs",
      entityId: ctx.runId,
      reasoning: summary,
      after: {
        ready: report.ready,
        passed: report.passed,
        failed: report.failed,
        failedControls: report.failedControls,
      },
    });

    return {
      outputJson: { report },
      reasoningSummary: summary,
      dataSources: [
        {
          kind: "external",
          ref: "compliance/launchChecklist",
          note: "runLaunchReadiness() over shipped code/config",
        },
      ],
      // Confident in the automated portion; a human still reviews/approves.
      confidence: report.ready ? 0.9 : 0.6,
      riskFlags,
      // Agents emit DRAFTs only — a human accepts the report.
      status: "needs_review",
    };
  },
};

export default compliancePrivacyAgent;
