import { describe, it, expect } from "vitest";
import {
  getContextualSuggestions,
  completeSlashCommand,
  SLASH_COMMANDS,
  TOP_LEVEL_COMMANDS,
  FIX_SUBCOMMANDS,
} from "../src/ui/slashCommands.js";
import { buildFixInstruction } from "../src/chat.js";

describe("Actionable /fix Command Suite", () => {
  describe("Slash Command Autocomplete for /fix", () => {
    it("includes /fix in top-level SLASH_COMMANDS and TOP_LEVEL_COMMANDS", () => {
      const slashFix = SLASH_COMMANDS.find((c) => c.command === "/fix");
      expect(slashFix).toBeDefined();
      expect(slashFix?.syntax).toBe("/fix [blockers|majors|all|<issue>]");
      expect(slashFix?.description).toContain("Automatically execute fixes");

      const topFix = TOP_LEVEL_COMMANDS.find((c) => c.value === "/fix");
      expect(topFix).toBeDefined();
    });

    it("suggests /fix when typing slash prefix '/f'", () => {
      const suggestions = getContextualSuggestions("/f");
      expect(suggestions.items.some((i) => i.value === "/fix")).toBe(true);
    });

    it("returns fix target suggestions for '/fix '", () => {
      const suggestions = getContextualSuggestions("/fix ");
      expect(suggestions.title).toBe("Fix Target");
      expect(suggestions.items.map((i) => i.value)).toEqual(["blockers", "majors", "all"]);
      expect(suggestions.items[0].description).toContain("Fix critical blockers");
      expect(suggestions.items[1].description).toContain("Fix major architectural and security issues");
      expect(suggestions.items[2].description).toContain("Execute fixes for all identified issues");
    });

    it("filters sub-commands when typing prefix (e.g. '/fix b', '/fix m', '/fix a')", () => {
      const bRes = getContextualSuggestions("/fix b");
      expect(bRes.items.length).toBe(1);
      expect(bRes.items[0].value).toBe("blockers");

      const mRes = getContextualSuggestions("/fix m");
      expect(mRes.items.length).toBe(1);
      expect(mRes.items[0].value).toBe("majors");

      const aRes = getContextualSuggestions("/fix a");
      expect(aRes.items.length).toBe(1);
      expect(aRes.items[0].value).toBe("all");
    });

    it("completes /fix sub-command with completeSlashCommand", () => {
      const completed = completeSlashCommand("/fix ", {
        value: "blockers",
        description: "Fix critical blockers",
      });
      expect(completed).toBe("/fix blockers");

      const completedPartial = completeSlashCommand("/fix maj", {
        value: "majors",
        description: "Fix major issues",
      });
      expect(completedPartial).toBe("/fix majors");
    });

    it("dismisses dropdown once target is typed followed by space", () => {
      expect(getContextualSuggestions("/fix blockers ").items).toEqual([]);
      expect(getContextualSuggestions("/fix majors ").items).toEqual([]);
      expect(getContextualSuggestions("/fix all ").items).toEqual([]);
      expect(getContextualSuggestions("/fix blockers and majors").items).toEqual([]);
    });
  });

  describe("Fix Instruction Formulation", () => {
    it("formulates autonomous fix prompt for default target 'all'", () => {
      const instruction = buildFixInstruction("all");
      expect(instruction).toBe(
        "Please execute the necessary code edits using editFile and writeFile to resolve all [all] identified in your previous audit report. Verify each change and inspect the diff."
      );
    });

    it("formulates autonomous fix prompt for 'blockers'", () => {
      const instruction = buildFixInstruction("blockers");
      expect(instruction).toContain("[blockers]");
      expect(instruction).toContain("editFile and writeFile");
      expect(instruction).toContain("Verify each change and inspect the diff.");
    });

    it("formulates autonomous fix prompt for 'majors'", () => {
      const instruction = buildFixInstruction("majors");
      expect(instruction).toContain("[majors]");
    });

    it("formulates autonomous fix prompt for custom user issue description", () => {
      const instruction = buildFixInstruction("SQL injection vulnerability in auth.ts");
      expect(instruction).toContain("[SQL injection vulnerability in auth.ts]");
    });

    it("defaults empty or whitespace-only target to 'all'", () => {
      expect(buildFixInstruction("")).toContain("[all]");
      expect(buildFixInstruction("   ")).toContain("[all]");
    });
  });
});
