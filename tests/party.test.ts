import { describe, it, expect, vi } from "vitest";
import {
  renderTokenWarningBox,
  formatQuartetReport,
  runPartyOrchestration,
} from "../src/party.js";
import { getPartyPersonaPrompt } from "../src/personas.js";
import {
  getContextualSuggestions,
  completeSlashCommand,
  SLASH_COMMANDS,
  TOP_LEVEL_COMMANDS,
  PARTY_SUBCOMMANDS,
} from "../src/ui/slashCommands.js";

describe("Party Mode - Persona Quartet Simultaneous Orchestration Suite", () => {
  describe("renderTokenWarningBox", () => {
    it("renders formatted boxed warning for token-intensive mode", () => {
      const box = renderTokenWarningBox();

      expect(box).toContain("TOKEN INTENSIVE NOTICE");
      expect(box).toContain("Party Mode orchestrates all 4 personas (ELI, REI, SORA, RIN)");
      expect(box).toContain("simultaneously. This will consume higher API token quota");
      expect(box).toContain("(~3-4x of a single message).");
      expect(box).toContain("╭──");
      expect(box).toContain("╰──");
    });
  });

  describe("getPartyPersonaPrompt", () => {
    const task = "Review authentication and database migrations";
    const context = "Express server with PostgreSQL and JWT";

    it("tailors ELI's role as Lead Coordinator & Synthesizer", () => {
      const prompt = getPartyPersonaPrompt("eli", task, context);

      expect(prompt).toContain("LEAD COORDINATOR & SYNTHESIZER");
      expect(prompt).toContain("synthesize their findings into a unified, empathetic, and actionable action plan");
      expect(prompt).toContain(task);
      expect(prompt).toContain(context);
    });

    it("tailors RIN's role as Merciless Security & Bug Auditor", () => {
      const prompt = getPartyPersonaPrompt("rin", task, context);

      expect(prompt).toContain("MERCILESS SECURITY & BUG AUDITOR");
      expect(prompt).toContain("ruthlessly discover security vulnerabilities");
      expect(prompt).toContain(task);
      expect(prompt).toContain(context);
    });

    it("tailors REI's role as Cold Architecture & Performance Optimizer", () => {
      const prompt = getPartyPersonaPrompt("rei", task, context);

      expect(prompt).toContain("COLD ARCHITECTURE & PERFORMANCE OPTIMIZER");
      expect(prompt).toContain("code structure, modularity, algorithmic complexity");
      expect(prompt).toContain(task);
      expect(prompt).toContain(context);
    });

    it("tailors SORA's role as Enthusiastic Creative & UX Innovator", () => {
      const prompt = getPartyPersonaPrompt("sora", task, context);

      expect(prompt).toContain("ENTHUSIASTIC CREATIVE & UX INNOVATOR");
      expect(prompt).toContain("explore user delight, developer experience polish");
      expect(prompt).toContain(task);
      expect(prompt).toContain(context);
    });
  });

  describe("formatQuartetReport", () => {
    it("formats the structured Quartet report with all 4 persona contributions", () => {
      const eli = "Prioritize fixing SQL injection first, then modularize database client.";
      const rin = "Found unescaped user parameter in raw SQL query at auth.ts:45.";
      const rei = "Refactor database pool singleton to prevent connection leaks under load.";
      const sora = "Add interactive CLI progress bar for database migrations.";

      const report = formatQuartetReport(eli, rin, rei, sora);

      expect(report).toContain("# ✨ ELENALYSE QUARTET REPORT (Party Mode)");
      expect(report).toContain("**Coordinated by ELI (Warm Mentor)**");
      expect(report).toContain("### 🔥 RIN's Security & Vulnerability Audit");
      expect(report).toContain(rin);
      expect(report).toContain("### ❄️ REI's Architecture & Performance Optimization");
      expect(report).toContain(rei);
      expect(report).toContain("### ☀️ SORA's Creative & Feature Enhancements");
      expect(report).toContain(sora);
      expect(report).toContain("### 🌱 ELI's Synthesis & Actionable Next Steps");
      expect(report).toContain(eli);
    });
  });

  describe("Slash Command Autocomplete for /party", () => {
    it("includes /party in top-level SLASH_COMMANDS and TOP_LEVEL_COMMANDS", () => {
      const slashParty = SLASH_COMMANDS.find((c) => c.command === "/party");
      expect(slashParty).toBeDefined();
      expect(slashParty?.syntax).toBe("/party [audit|review|brainstorm|<custom-task>]");
      expect(slashParty?.description).toContain("Orchestrate all 4 personas simultaneously");

      const topParty = TOP_LEVEL_COMMANDS.find((c) => c.value === "/party");
      expect(topParty).toBeDefined();
    });

    it("suggests /party when typing slash prefix '/pa'", () => {
      const suggestions = getContextualSuggestions("/pa");
      expect(suggestions.items.some((i) => i.value === "/party")).toBe(true);
    });

    it("returns task sub-commands for '/party '", () => {
      const suggestions = getContextualSuggestions("/party ");
      expect(suggestions.title).toBe("Party Task");
      expect(suggestions.items.map((i) => i.value)).toEqual(["audit", "review", "brainstorm"]);
      expect(suggestions.items[0].description).toContain("Full Quartet audit");
      expect(suggestions.items[1].description).toContain("Comprehensive code review");
      expect(suggestions.items[2].description).toContain("Brainstorm architecture, features, and risk analysis");
    });

    it("filters sub-commands on prefix typing", () => {
      const aRes = getContextualSuggestions("/party a");
      expect(aRes.items.length).toBe(1);
      expect(aRes.items[0].value).toBe("audit");

      const rRes = getContextualSuggestions("/party r");
      expect(rRes.items.length).toBe(1);
      expect(rRes.items[0].value).toBe("review");

      const bRes = getContextualSuggestions("/party b");
      expect(bRes.items.length).toBe(1);
      expect(bRes.items[0].value).toBe("brainstorm");
    });

    it("completes /party sub-command with completeSlashCommand", () => {
      const completed = completeSlashCommand("/party ", {
        value: "audit",
        description: "Full Quartet audit",
      });
      expect(completed).toBe("/party audit");
    });

    it("dismisses dropdown once task is typed followed by space", () => {
      expect(getContextualSuggestions("/party audit ").items).toEqual([]);
      expect(getContextualSuggestions("/party review ").items).toEqual([]);
      expect(getContextualSuggestions("/party brainstorm ").items).toEqual([]);
      expect(getContextualSuggestions("/party audit and review").items).toEqual([]);
    });
  });

  describe("runPartyOrchestration Execution & Cancellation", () => {
    it("handles cancellation gracefully when promptConfirmation returns false", async () => {
      const promptConfirmation = vi.fn().mockResolvedValue(false);

      const result = await runPartyOrchestration({
        task: "Check codebase",
        aiClientFactory: {} as any,
        promptConfirmation,
      });

      expect(promptConfirmation).toHaveBeenCalled();
      expect(result.cancelled).toBe(true);
      expect(result.report).toContain("cancelled by user");
      expect(result.totalTokens.promptTokens).toBe(0);
    });
  });
});
