import { describe, it, expect } from "vitest";
import {
  renderWelcomeBanner,
  PERSONA_ARCHETYPES,
} from "../src/ui/banner.js";
import {
  filterSlashCommands,
  getContextualSuggestions,
  getNextIndex,
  completeSlashCommand,
  SLASH_COMMANDS,
  PERSONA_SUBCOMMANDS,
  PROVIDER_SUBCOMMANDS,
  FALLBACK_PROVIDER_SUBCOMMANDS,
  SESSION_SUBCOMMANDS,
  API_SUBCOMMANDS,
  MODEL_SUGGESTIONS,
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

  describe("Contextual Multi-Level Sub-Command Autocomplete", () => {
    it("returns top-level commands when input is '/' or partial command", () => {
      const allCmds = getContextualSuggestions("/");
      expect(allCmds.title).toBe("Available Commands");
      expect(allCmds.items.length).toBe(SLASH_COMMANDS.length);

      const pCmds = getContextualSuggestions("/p");
      expect(pCmds.items.map((i) => i.value)).toEqual([
        "/persona",
        "/provider",
        "/paste",
        "/party",
      ]);
    });

    it("resolves Level 2 sub-options for '/persona ' with prefix filtering", () => {
      const allPersonas = getContextualSuggestions("/persona ");
      expect(allPersonas.title).toBe("Select Persona");
      expect(allPersonas.items.map((i) => i.value)).toEqual([
        "eli",
        "rei",
        "sora",
        "rin",
      ]);

      const filtered = getContextualSuggestions("/persona r");
      expect(filtered.title).toBe("Select Persona");
      expect(filtered.items.map((i) => i.value)).toEqual(["rei", "rin"]);
    });

    it("resolves Level 2 sub-options for '/provider ' and Level 3 for '/provider fallback '", () => {
      const providers = getContextualSuggestions("/provider ");
      expect(providers.title).toBe("Select Provider");
      expect(providers.items.map((i) => i.value)).toContain("google");
      expect(providers.items.map((i) => i.value)).toContain("fallback");

      const fallbacks = getContextualSuggestions("/provider fallback ");
      expect(fallbacks.title).toBe("Select Fallback Provider");
      expect(fallbacks.items.map((i) => i.value)).toEqual([
        "google",
        "openai",
        "openrouter",
        "local",
      ]);

      const filteredFallback = getContextualSuggestions("/provider fallback g");
      expect(filteredFallback.items.map((i) => i.value)).toEqual(["google"]);
    });

    it("resolves Level 2 sub-options for '/session ' and dynamic Level 3 for '/session load '", () => {
      const sessionOps = getContextualSuggestions("/session ");
      expect(sessionOps.title).toBe("Session Commands");
      expect(sessionOps.items.map((i) => i.value)).toEqual([
        "save",
        "load",
        "list",
      ]);

      // Provide mock sessions to test dynamic session resolution
      const mockSessions = ["client-work", "debug-ai", "demo-app"];
      const sessionLoads = getContextualSuggestions(
        "/session load ",
        mockSessions
      );
      expect(sessionLoads.title).toBe("Select Saved Session");
      expect(sessionLoads.items.map((i) => i.value)).toEqual(mockSessions);

      const filteredLoads = getContextualSuggestions(
        "/session load d",
        mockSessions
      );
      expect(filteredLoads.items.map((i) => i.value)).toEqual([
        "debug-ai",
        "demo-app",
      ]);
    });

    it("resolves Level 2 sub-options for '/api ' and '/model '", () => {
      const apiProviders = getContextualSuggestions("/api ");
      expect(apiProviders.title).toBe("Select Provider for API Key");
      expect(apiProviders.items.map((i) => i.value)).toEqual([
        "google",
        "openai",
        "openrouter",
      ]);

      const models = getContextualSuggestions("/model ");
      expect(models.title).toBe("Model Suggestions");
      expect(models.items.map((i) => i.value)).toContain("gemini-2.5-flash");
      expect(models.items.map((i) => i.value)).toContain("gpt-4o");

      const filteredModel = getContextualSuggestions("/model gpt");
      expect(filteredModel.items.map((i) => i.value)).toEqual([
        "gpt-4o",
        "gpt-4o-mini",
      ]);
    });

    it("completes sub-options accurately across all levels", () => {
      // Level 1 completion
      expect(
        completeSlashCommand("/per", {
          value: "/persona",
          label: "/persona",
          command: "/persona",
          description: "",
        })
      ).toBe("/persona ");

      // Level 2 completion with trailing space in input
      expect(
        completeSlashCommand("/persona ", {
          value: "rei",
          label: "rei",
          command: "rei",
          description: "",
        })
      ).toBe("/persona rei");

      // Level 2 completion with partial query in input
      expect(
        completeSlashCommand("/persona r", {
          value: "rei",
          label: "rei",
          command: "rei",
          description: "",
        })
      ).toBe("/persona rei");

      // Level 3 completion
      expect(
        completeSlashCommand("/provider fallback ", {
          value: "google",
          label: "google",
          command: "google",
          description: "",
        })
      ).toBe("/provider fallback google");

      expect(
        completeSlashCommand("/provider fallback o", {
          value: "openai",
          label: "openai",
          command: "openai",
          description: "",
        })
      ).toBe("/provider fallback openai");

      expect(
        completeSlashCommand("/session load ", {
          value: "my-session",
          label: "my-session",
          command: "my-session",
          description: "",
        })
      ).toBe("/session load my-session");
    });

    it("dismisses dropdown when input does not match any valid slash command", () => {
      expect(getContextualSuggestions("/coba").items).toEqual([]);
      expect(getContextualSuggestions("/coba cari celah").items).toEqual([]);
      expect(getContextualSuggestions("/xyz").items).toEqual([]);
      expect(getContextualSuggestions("/unknown command").items).toEqual([]);
    });

    it("suppresses dropdown on trailing space when command arguments are already supplied", () => {
      // /persona takes 1 arg
      expect(getContextualSuggestions("/persona eli ").items).toEqual([]);
      expect(getContextualSuggestions("/persona eli extra text").items).toEqual([]);

      // /setting sub-commands
      expect(getContextualSuggestions("/setting memory amnesia ").items).toEqual([]);
      expect(getContextualSuggestions("/setting steps 25 ").items).toEqual([]);
      expect(getContextualSuggestions("/setting voice on ").items).toEqual([]);
      expect(getContextualSuggestions("/setting show ").items).toEqual([]);

      // /provider takes 1 arg (non-fallback) and 2 args (fallback)
      expect(getContextualSuggestions("/provider google ").items).toEqual([]);
      expect(getContextualSuggestions("/provider fallback google ").items).toEqual([]);

      // /api provider typed -> next is secret key
      expect(getContextualSuggestions("/api google ").items).toEqual([]);

      // /session sub-commands
      expect(getContextualSuggestions("/session save ").items).toEqual([]);
      expect(getContextualSuggestions("/session load mysession ").items).toEqual([]);
      expect(getContextualSuggestions("/session list ").items).toEqual([]);

      // /model takes 1 arg
      expect(getContextualSuggestions("/model gpt-4o ").items).toEqual([]);

      // Zero-arg commands
      expect(getContextualSuggestions("/help ").items).toEqual([]);
      expect(getContextualSuggestions("/clear ").items).toEqual([]);
      expect(getContextualSuggestions("/exit ").items).toEqual([]);
      expect(getContextualSuggestions("/undo ").items).toEqual([]);
      expect(getContextualSuggestions("/retry ").items).toEqual([]);
      expect(getContextualSuggestions("/paste ").items).toEqual([]);
    });
  });

  describe("English-First Metadata Verification", () => {
    it("ensures all command and sub-command descriptions are English-first", () => {
      const allSets = [
        SLASH_COMMANDS,
        PERSONA_SUBCOMMANDS,
        PROVIDER_SUBCOMMANDS,
        FALLBACK_PROVIDER_SUBCOMMANDS,
        SESSION_SUBCOMMANDS,
        API_SUBCOMMANDS,
        MODEL_SUGGESTIONS,
      ];

      // Non-English / Indonesian words that should not appear in metadata
      const forbiddenWords = ["ubah", "simpan", "tampilkan", "keluar", "pilih", "pengaturan"];

      for (const list of allSets) {
        for (const item of list) {
          expect(item.description.length).toBeGreaterThan(0);
          for (const word of forbiddenWords) {
            expect(item.description.toLowerCase()).not.toContain(word);
          }
        }
      }
    });
  });

  describe("Dropdown Navigation & Frame Rendering", () => {
    it("navigates down and up with wrap-around", () => {
      expect(getNextIndex(0, 3, "down")).toBe(1);
      expect(getNextIndex(2, 3, "down")).toBe(0);
      expect(getNextIndex(0, 3, "up")).toBe(2);
      expect(getNextIndex(0, 0, "down")).toBe(0);
    });

    it("renders formatted dropdown box with custom contextual title and item pointer", () => {
      const suggestions = getContextualSuggestions("/persona ");
      const lines = renderDropdownLines(
        suggestions.items,
        1,
        suggestions.title
      );

      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain("Select Persona");
      expect(lines.some((l) => l.includes("❯") && l.includes("rei"))).toBe(true);
      expect(lines[lines.length - 1]).toContain("Tab/Enter Select");
    });

    it("returns empty array when suggestions list is empty", () => {
      expect(renderDropdownLines([], 0)).toEqual([]);
    });
  });
});
