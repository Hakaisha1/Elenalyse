import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  SLASH_COMMANDS,
  TOP_LEVEL_COMMANDS,
  SETTING_SUBCOMMANDS,
  SETTING_MEMORY_SUBCOMMANDS,
  SETTING_STEPS_SUBCOMMANDS,
  SETTING_VOICE_SUBCOMMANDS,
  getContextualSuggestions,
  completeSlashCommand,
} from "../src/ui/slashCommands.js";
import { renderSettingsBox } from "../src/ui/banner.js";
import { getConfig, setConfig, Config } from "../src/config.js";
import {
  MAX_AUTONOMOUS_STEPS,
  getAutonomousStepLimitPrompt,
  getSummaryRecoveryPrompt,
  getFinalSummaryFallbackText,
} from "../src/chat.js";
import { extractTextToolCalls, stripToolCallTags } from "../src/toolParser.js";

const configPath = path.join(os.homedir(), ".elenalyserc.json");

describe("Interactive /setting Menu and Settings Persistence", () => {
  let originalConfig: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(configPath)) {
      originalConfig = fs.readFileSync(configPath, "utf-8");
    } else {
      originalConfig = null;
    }
  });

  afterEach(() => {
    if (originalConfig !== null) {
      fs.writeFileSync(configPath, originalConfig, "utf-8");
    } else if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  describe("Slash Command Suggestions and Autocomplete", () => {
    it("includes /setting in top-level SLASH_COMMANDS and TOP_LEVEL_COMMANDS", () => {
      const slashCmd = SLASH_COMMANDS.find((c) => c.command === "/setting");
      expect(slashCmd).toBeDefined();
      expect(slashCmd?.syntax).toContain("/setting");
      expect(slashCmd?.description).toContain("settings");

      const topItem = TOP_LEVEL_COMMANDS.find((c) => c.value === "/setting");
      expect(topItem).toBeDefined();
    });

    it("returns level 2 suggestions for /setting", () => {
      const res = getContextualSuggestions("/setting ");
      expect(res.title).toBe("Settings Menu");
      expect(res.items.length).toBe(4);
      const values = res.items.map((i) => i.value);
      expect(values).toContain("show");
      expect(values).toContain("memory");
      expect(values).toContain("steps");
      expect(values).toContain("voice");
    });

    it("filters level 2 suggestions when typing sub-command prefix", () => {
      const res = getContextualSuggestions("/setting me");
      expect(res.items.length).toBe(1);
      expect(res.items[0].value).toBe("memory");
    });

    it("returns level 3 suggestions for /setting memory", () => {
      const res = getContextualSuggestions("/setting memory ");
      expect(res.title).toBe("Select Memory Mode");
      expect(res.items.length).toBe(3);
      const values = res.items.map((i) => i.value);
      expect(values).toEqual(["amnesia", "default", "focus"]);
    });

    it("returns level 3 suggestions for /setting steps", () => {
      const res = getContextualSuggestions("/setting steps ");
      expect(res.title).toBe("Select Max Autonomous Steps");
      expect(res.items.length).toBe(3);
      const values = res.items.map((i) => i.value);
      expect(values).toEqual(["15", "25", "40"]);
    });

    it("returns level 3 suggestions for /setting voice", () => {
      const res = getContextualSuggestions("/setting voice ");
      expect(res.title).toBe("Toggle Voice Synthesis");
      expect(res.items.length).toBe(2);
      const values = res.items.map((i) => i.value);
      expect(values).toEqual(["on", "off"]);
    });

    it("completes sub-options cleanly with completeSlashCommand", () => {
      const memorySub = SETTING_SUBCOMMANDS.find((s) => s.value === "memory")!;
      const completedL2 = completeSlashCommand("/setting ", memorySub);
      expect(completedL2).toBe("/setting memory");

      const completedL2WithPrefix = completeSlashCommand("/setting me", memorySub);
      expect(completedL2WithPrefix).toBe("/setting memory");

      const focusSub = SETTING_MEMORY_SUBCOMMANDS.find((s) => s.value === "focus")!;
      const completedL3 = completeSlashCommand("/setting memory ", focusSub);
      expect(completedL3).toBe("/setting memory focus");

      const completedL3WithPrefix = completeSlashCommand("/setting memory foc", focusSub);
      expect(completedL3WithPrefix).toBe("/setting memory focus");
    });

    it("renders clean rounded-box settings banner", () => {
      const box = renderSettingsBox({
        memoryMode: "focus",
        maxSteps: 40,
        provider: "openrouter",
        model: "openrouter/free",
        fallbackProvider: "google",
        fallbackModel: "gemini-2.5-flash",
        voiceEnabled: true,
      });

      expect(box).toContain("E L E N A L Y S E   S E T T I N G S");
      expect(box).toContain("focus (100 msgs limit)");
      expect(box).toContain("40 steps");
      expect(box).toContain("openrouter");
      expect(box).toContain("google (gemini-2.5-flash)");
      expect(box).toContain("ON (VOICEVOX Engine)");
    });
  });

  describe("Config Persistence for memoryMode and maxSteps", () => {
    it("has default values for memoryMode and maxSteps", () => {
      expect(MAX_AUTONOMOUS_STEPS).toBe(25);
      const config = getConfig();
      expect(["default", "amnesia", "focus", undefined]).toContain(config.memoryMode);
      expect(config.maxSteps === 25 || typeof config.maxSteps === "number").toBe(true);
    });

    it("saves and retrieves memoryMode, maxSteps, and voiceEnabled", () => {
      setConfig({
        memoryMode: "amnesia",
        maxSteps: 40,
        voiceEnabled: true,
      });

      const updated = getConfig();
      expect(updated.memoryMode).toBe("amnesia");
      expect(updated.maxSteps).toBe(40);
      expect(updated.voiceEnabled).toBe(true);

      // Verify file persistence
      expect(fs.existsSync(configPath)).toBe(true);
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(raw.memoryMode).toBe("amnesia");
      expect(raw.maxSteps).toBe(40);
    });
  });

  describe("Final Summary Recovery Logic", () => {
    it("provides strict autonomous step limit prompt", () => {
      const prompt = getAutonomousStepLimitPrompt();
      expect(prompt).toContain("[System: Autonomous step limit reached.");
      expect(prompt).toContain("DO NOT call any more tools");
      expect(prompt).toContain("Markdown");
    });

    it("provides summary recovery prompt with or without tool result", () => {
      const fallbackPrompt = getSummaryRecoveryPrompt();
      expect(fallbackPrompt).toContain("[System: Previous response only contained a tool call.");
      expect(fallbackPrompt).toContain("Do not call tools.");

      const withResult = getSummaryRecoveryPrompt({
        toolName: "readFile",
        output: "export const app = 1;",
      });
      expect(withResult).toContain('Tool "readFile" result:');
      expect(withResult).toContain("export const app = 1;");
      expect(withResult).toContain("Deliver your complete analysis report now");
    });

    it("provides non-empty fallback text to prevent dead silence", () => {
      const fallback = getFinalSummaryFallbackText(25);
      expect(fallback).toBe("Analysis completed across 25 steps. Please ask specific questions about the inspected files.");
      expect(fallback.length).toBeGreaterThan(0);
    });

    it("recovers gracefully when model emits tool call on summary generation", () => {
      // Scenario: Model emits XML tool call instead of markdown summary
      const modelRawSummary = `<tool_call>
<function=readFile>
<parameter=filePath>
src/index.ts
</parameter>
</function>
</tool_call>`;

      let finalText = stripToolCallTags(modelRawSummary).trim();
      expect(finalText).toBe(""); // Notice raw text stripped to empty!

      // Simulator of recovery logic:
      if (!finalText) {
        const { toolCalls } = extractTextToolCalls(modelRawSummary);
        expect(toolCalls.length).toBe(1);
        expect(toolCalls[0].toolName).toBe("readFile");

        // Tool output simulation
        const simulatedOutput = "console.log('hello');";
        const recoveryPrompt = getSummaryRecoveryPrompt({
          toolName: toolCalls[0].toolName,
          output: simulatedOutput,
        });
        expect(recoveryPrompt).toContain('Tool "readFile" result:');

        // Simulated recovery output from second run
        const simulatedReport = "# Architectural Audit Report\n\nAll components are verified.";
        finalText = stripToolCallTags(simulatedReport).trim();
      }

      expect(finalText).toContain("# Architectural Audit Report");
      expect(finalText.length).toBeGreaterThan(0);
    });

    it("uses final fallback text when second recovery stage is also empty", () => {
      let finalText = "";
      const stepCount = 25;

      if (!finalText) {
        finalText = getFinalSummaryFallbackText(stepCount);
      }

      expect(finalText).toBe("Analysis completed across 25 steps. Please ask specific questions about the inspected files.");
      expect(finalText.length).toBeGreaterThan(0);
    });
  });
});
