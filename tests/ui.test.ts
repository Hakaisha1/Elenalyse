import { describe, it, expect } from "vitest";
import {
  renderWelcomeBanner,
  PERSONA_ARCHETYPES,
} from "../src/ui/banner.js";
import {
  filterSlashCommands,
  getNextIndex,
  completeSlashCommand,
  SLASH_COMMANDS,
} from "../src/ui/slashCommands.js";
import { renderDropdownLines } from "../src/ui/prompt.js";

describe("Modern UI / UX Suite", () => {
  describe("Welcome Banner (renderWelcomeBanner)", () => {
    it("renders rounded box borders and title", () => {
      const banner = renderWelcomeBanner({
        persona: "eli",
        provider: "google",
        model: "gemini-2.0-flash",
        memoryMode: "default",
        voiceEnabled: false,
      });

      expect(banner).toContain("╭");
      expect(banner).toContain("╰");
      expect(banner).toContain("│");
      expect(banner).toContain("E L E N A L Y S E");
    });

    it("displays persona badge and archetype information for each persona", () => {
      for (const p of ["eli", "rei", "sora", "rin"] as const) {
        const banner = renderWelcomeBanner({
          persona: p,
          provider: "openai",
          model: "gpt-4o",
          memoryMode: "focus",
          voiceEnabled: true,
        });

        const info = PERSONA_ARCHETYPES[p];
        expect(banner).toContain(info.title);
        expect(banner).toContain(info.subtitle);
      }
    });

    it("displays provider, model, memory limit, and voice state", () => {
      const banner = renderWelcomeBanner({
        persona: "rei",
        provider: "openrouter",
        model: "deepseek-coder",
        memoryMode: "amnesia",
        voiceEnabled: true,
      });

      expect(banner).toContain("openrouter");
      expect(banner).toContain("deepseek-coder");
      expect(banner).toContain("amnesia (10 msgs)");
      expect(banner).toContain("VOICEVOX Engine");
    });

    it("renders fallback provider when configured, or 'None' when missing", () => {
      const withFallback = renderWelcomeBanner({
        persona: "sora",
        provider: "openrouter",
        model: "llama3",
        fallbackProvider: "google",
        fallbackModel: "gemini-1.5-flash",
        memoryMode: "default",
        voiceEnabled: false,
      });
      expect(withFallback).toContain("google (gemini-1.5-flash)");

      const withoutFallback = renderWelcomeBanner({
        persona: "sora",
        provider: "openrouter",
        model: "llama3",
        memoryMode: "default",
        voiceEnabled: false,
      });
      expect(withoutFallback).toContain("None");
    });
  });

  describe("Slash Commands Autocomplete (filterSlashCommands)", () => {
    it("returns all slash commands when typing '/'", () => {
      const matches = filterSlashCommands("/");
      expect(matches.length).toBe(SLASH_COMMANDS.length);
      expect(matches.map((c) => c.command)).toContain("/help");
      expect(matches.map((c) => c.command)).toContain("/exit");
    });

    it("filters commands by prefix matching", () => {
      const pMatches = filterSlashCommands("/p");
      expect(pMatches.map((c) => c.command)).toEqual([
        "/persona",
        "/provider",
        "/paste",
      ]);

      const uMatches = filterSlashCommands("/u");
      expect(uMatches.map((c) => c.command)).toEqual(["/undo"]);

      const sMatches = filterSlashCommands("/s");
      expect(sMatches.map((c) => c.command)).toEqual(["/session"]);
    });

    it("returns empty array when no commands match query", () => {
      expect(filterSlashCommands("/unknowncommand")).toEqual([]);
    });

    it("returns empty array when input does not start with '/'", () => {
      expect(filterSlashCommands("hello")).toEqual([]);
      expect(filterSlashCommands("")).toEqual([]);
    });
  });

  describe("Dropdown Navigation (getNextIndex)", () => {
    it("navigates down with wrap-around", () => {
      expect(getNextIndex(0, 3, "down")).toBe(1);
      expect(getNextIndex(1, 3, "down")).toBe(2);
      expect(getNextIndex(2, 3, "down")).toBe(0); // Wrap around
    });

    it("navigates up with wrap-around", () => {
      expect(getNextIndex(2, 3, "up")).toBe(1);
      expect(getNextIndex(1, 3, "up")).toBe(0);
      expect(getNextIndex(0, 3, "up")).toBe(2); // Wrap around
    });

    it("handles total <= 0 safely", () => {
      expect(getNextIndex(0, 0, "down")).toBe(0);
      expect(getNextIndex(0, 0, "up")).toBe(0);
    });
  });

  describe("Command Completion (completeSlashCommand)", () => {
    it("appends trailing space to completed command if no args were present", () => {
      const selected = SLASH_COMMANDS.find((c) => c.command === "/persona")!;
      expect(completeSlashCommand("/per", selected)).toBe("/persona ");
    });

    it("preserves trailing arguments when autocompleting", () => {
      const selected = SLASH_COMMANDS.find((c) => c.command === "/persona")!;
      expect(completeSlashCommand("/p rin", selected)).toBe("/persona rin");
    });
  });

  describe("Dropdown Box Rendering (renderDropdownLines)", () => {
    it("renders formatted dropdown frame with command items", () => {
      const commands = filterSlashCommands("/p");
      const lines = renderDropdownLines(commands, 0);

      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain("Slash Commands");
      expect(lines.some((l) => l.includes("❯"))).toBe(true);
      expect(lines[lines.length - 1]).toContain("Tab/Enter Select");
    });

    it("returns empty array when commands list is empty", () => {
      expect(renderDropdownLines([], 0)).toEqual([]);
    });
  });
});
