import { generateText } from "ai";
import chalk from "chalk";
import { getPartyPersonaPrompt, getProjectContext, Persona } from "./personas.js";

/**
 * Party Mode - Persona Quartet Simultaneous Orchestration Engine
 * Coordinated under ELI's leadership
 */

export function renderTokenWarningBox(): string {
  const title = "TOKEN INTENSIVE NOTICE";
  const lines = [
    "Party Mode orchestrates all 4 personas (ELI, REI, SORA, RIN)",
    "simultaneously. This will consume higher API token quota",
    "(~3-4x of a single message).",
  ];
  const innerWidth = 60;
  const topBorder =
    chalk.yellow(`╭── ${title} `) +
    chalk.yellow("─".repeat(Math.max(2, innerWidth - title.length - 2)) + "╮");
  const bottomBorder = chalk.yellow("╰" + "─".repeat(innerWidth + 2) + "╯");

  const contentLines = lines.map((l) => {
    const pad = Math.max(0, innerWidth - l.length);
    return chalk.yellow("│ ") + chalk.white(l) + " ".repeat(pad) + chalk.yellow(" │");
  });

  return [topBorder, ...contentLines, bottomBorder].join("\n");
}

export function formatQuartetReport(
  eliSynthesis: string,
  rinAudit: string,
  reiAnalysis: string,
  soraIdeation: string
): string {
  return [
    "# ELENALYSE QUARTET REPORT (Party Mode)",
    "**Coordinated by ELI (Warm Mentor)**",
    "",
    "### RIN: Security & Vulnerability Audit",
    rinAudit.trim(),
    "",
    "### REI: Architecture & Performance Optimization",
    reiAnalysis.trim(),
    "",
    "### SORA: Creative & Feature Enhancements",
    soraIdeation.trim(),
    "",
    "### ELI: Synthesis & Actionable Next Steps",
    eliSynthesis.trim(),
  ].join("\n");
}

export interface PartyOrchestrationOptions {
  task: string;
  aiClientFactory: any;
  toolsMap?: any;
  promptConfirmation?: (warningBox: string) => Promise<boolean>;
  onProgress?: (msg: string) => void;
  sharedContext?: string;
  maxTokens?: number;
}

export interface PartyOrchestrationResult {
  report: string;
  cancelled?: boolean;
  totalTokens: {
    promptTokens: number;
    completionTokens: number;
  };
  individualReports: {
    rin: string;
    rei: string;
    sora: string;
    eli: string;
  };
}

export async function runPartyOrchestration(
  options: PartyOrchestrationOptions
): Promise<PartyOrchestrationResult> {
  const warningBox = renderTokenWarningBox();

  // 1. Prompt interactive confirmation if requested
  if (options.promptConfirmation) {
    const confirmed = await options.promptConfirmation(warningBox);
    if (!confirmed) {
      return {
        report: "Party mode orchestration was cancelled by user.",
        cancelled: true,
        totalTokens: { promptTokens: 0, completionTokens: 0 },
        individualReports: { rin: "", rei: "", sora: "", eli: "" },
      };
    }
  }

  // 2. Gather project context
  const context =
    options.sharedContext ||
    getProjectContext() ||
    "Elenalyse Project Workspace";

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  // 3. Run RIN, REI, and SORA evaluations simultaneously via Promise.all
  options.onProgress?.(
    "Party Mode: RIN, REI, and SORA analyzing simultaneously under ELI..."
  );

  const [rinResult, reiResult, soraResult] = await Promise.all([
    // RIN: Security & Vulnerability Audit
    generateText({
      model: options.aiClientFactory,
      system: getPartyPersonaPrompt("rin", options.task, context),
      prompt: `Please perform a thorough security and bug audit for: "${options.task}". Identify vulnerabilities, edge cases, and critical blockers.`,
      tools: options.toolsMap,
    }),

    // REI: Architecture & Performance Optimization
    generateText({
      model: options.aiClientFactory,
      system: getPartyPersonaPrompt("rei", options.task, context),
      prompt: `Please evaluate architecture, complexity, and performance for: "${options.task}". Identify structural bottlenecks and refactoring paths.`,
      tools: options.toolsMap,
    }),

    // SORA: Creative, UX & Future Feature Ideation
    generateText({
      model: options.aiClientFactory,
      system: getPartyPersonaPrompt("sora", options.task, context),
      prompt: `Please brainstorm UX enhancements, creative capabilities, and developer delight for: "${options.task}".`,
      tools: options.toolsMap,
    }),
  ]);

  const addUsage = (run: any) => {
    if (run.usage) {
      totalPromptTokens += (run.usage as any).promptTokens || 0;
      totalCompletionTokens += (run.usage as any).completionTokens || 0;
    }
  };

  addUsage(rinResult);
  addUsage(reiResult);
  addUsage(soraResult);

  // 4. ELI synthesizes all three viewpoints into unified roadmap
  options.onProgress?.(
    "Party Mode: ELI synthesizing Quartet findings into unified roadmap..."
  );

  const combinedFindings = [
    `=== RIN's Security & Vulnerability Audit ===\n${rinResult.text || "No security issues reported."}`,
    `=== REI's Architecture & Performance Optimization ===\n${reiResult.text || "No architecture issues reported."}`,
    `=== SORA's Creative & Feature Enhancements ===\n${soraResult.text || "No creative ideas reported."}`,
  ].join("\n\n");

  const eliResult = await generateText({
    model: options.aiClientFactory,
    system: getPartyPersonaPrompt("eli", options.task, combinedFindings),
    prompt: `Review the analyses from RIN, REI, and SORA above. Synthesize their findings with warmth and clarity, resolve any conflicts, and formulate a prioritized, actionable step-by-step implementation plan.`,
  });

  addUsage(eliResult);

  const finalReport = formatQuartetReport(
    eliResult.text || "",
    rinResult.text || "",
    reiResult.text || "",
    soraResult.text || ""
  );

  return {
    report: finalReport,
    cancelled: false,
    totalTokens: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
    },
    individualReports: {
      rin: rinResult.text || "",
      rei: reiResult.text || "",
      sora: soraResult.text || "",
      eli: eliResult.text || "",
    },
  };
}
