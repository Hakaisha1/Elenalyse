import { listSessionsSync } from "../session.js";

export interface SlashCommand {
  command: string;
  syntax: string;
  description: string;
}

export interface SuggestionItem {
  value: string;
  label: string;
  description: string;
  command: string;
  syntax?: string;
}

export interface SuggestionResult {
  title: string;
  items: SuggestionItem[];
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/help",
    syntax: "/help",
    description: "Show available commands and usage guide",
  },
  {
    command: "/setting",
    syntax: "/setting [memory|steps|voice|show] [value]",
    description: "Configure runtime settings (memory mode, autonomous steps, voice, etc.)",
  },
  {
    command: "/persona",
    syntax: "/persona <eli|rei|sora|rin>",
    description: "Switch active persona with context handoff",
  },
  {
    command: "/model",
    syntax: "/model <model-slug>",
    description: "Change AI model (e.g. gemini-2.5-flash, gpt-4o)",
  },
  {
    command: "/provider",
    syntax: "/provider <name|fallback>",
    description: "Set AI provider or configure failover fallback",
  },
  {
    command: "/api",
    syntax: "/api <provider> <key>",
    description: "Save API Key for a provider",
  },
  {
    command: "/undo",
    syntax: "/undo",
    description: "Undo last file write or modification",
  },
  {
    command: "/session",
    syntax: "/session <save|load|list>",
    description: "Manage persistent conversation sessions",
  },
  {
    command: "/paste",
    syntax: "/paste",
    description: "Multi-line paste mode (end with 'END')",
  },
  {
    command: "/retry",
    syntax: "/retry",
    description: "Retry the previous prompt",
  },
  {
    command: "/clear",
    syntax: "/clear",
    description: "Clear terminal screen and show banner",
  },
  {
    command: "/exit",
    syntax: "/exit",
    description: "Exit the application",
  },
];

export const PERSONA_SUBCOMMANDS: SuggestionItem[] = [
  {
    value: "eli",
    label: "eli",
    command: "eli",
    description: "🌱 Warm Mentor (Onboarding, friendly concept breakdowns, ELI5)",
  },
  {
    value: "rei",
    label: "rei",
    command: "rei",
    description: "❄️ Kuudere Architect (Refactoring, performance optimization, architecture)",
  },
  {
    value: "sora",
    label: "sora",
    command: "sora",
    description: "☀️ Deredere Creative (Brainstorming, exploration, new feature concepts)",
  },
  {
    value: "rin",
    label: "rin",
    command: "rin",
    description: "🔥 Tsundere Auditor (Strict security checks, error & bug detection)",
  },
];

export const PROVIDER_SUBCOMMANDS: SuggestionItem[] = [
  {
    value: "google",
    label: "google",
    command: "google",
    description: "Google Gemini API (gemini-2.5-flash / pro)",
  },
  {
    value: "openai",
    label: "openai",
    command: "openai",
    description: "OpenAI API (gpt-4o, gpt-4o-mini)",
  },
  {
    value: "openrouter",
    label: "openrouter",
    command: "openrouter",
    description: "OpenRouter API (multi-provider & free models)",
  },
  {
    value: "local",
    label: "local",
    command: "local",
    description: "Local Ollama instance (http://localhost:11434)",
  },
  {
    value: "fallback",
    label: "fallback",
    command: "fallback",
    description: "Configure failover fallback provider",
  },
];

export const FALLBACK_PROVIDER_SUBCOMMANDS: SuggestionItem[] = [
  {
    value: "google",
    label: "google",
    command: "google",
    description: "Google Gemini API as failover fallback",
  },
  {
    value: "openai",
    label: "openai",
    command: "openai",
    description: "OpenAI API as failover fallback",
  },
  {
    value: "openrouter",
    label: "openrouter",
    command: "openrouter",
    description: "OpenRouter API as failover fallback",
  },
  {
    value: "local",
    label: "local",
    command: "local",
    description: "Local Ollama instance as failover fallback",
  },
];

export const SESSION_SUBCOMMANDS: SuggestionItem[] = [
  {
    value: "save",
    label: "save",
    command: "save",
    description: "Save active multi-persona conversation memory to disk",
  },
  {
    value: "load",
    label: "load",
    command: "load",
    description: "Load previously saved session memory from disk",
  },
  {
    value: "list",
    label: "list",
    command: "list",
    description: "List all saved conversation sessions",
  },
];

export const API_SUBCOMMANDS: SuggestionItem[] = [
  {
    value: "google",
    label: "google",
    command: "google",
    description: "Save Google Gemini API key",
  },
  {
    value: "openai",
    label: "openai",
    command: "openai",
    description: "Save OpenAI API key",
  },
  {
    value: "openrouter",
    label: "openrouter",
    command: "openrouter",
    description: "Save OpenRouter API key",
  },
];

export const MODEL_SUGGESTIONS: SuggestionItem[] = [
  {
    value: "gemini-2.5-flash",
    label: "gemini-2.5-flash",
    command: "gemini-2.5-flash",
    description: "Fast, versatile Google multimodal model",
  },
  {
    value: "gemini-2.5-pro",
    label: "gemini-2.5-pro",
    command: "gemini-2.5-pro",
    description: "High-reasoning Google flagship model",
  },
  {
    value: "gpt-4o",
    label: "gpt-4o",
    command: "gpt-4o",
    description: "OpenAI flagship high-intelligence model",
  },
  {
    value: "gpt-4o-mini",
    label: "gpt-4o-mini",
    command: "gpt-4o-mini",
    description: "Fast, cost-efficient lightweight OpenAI model",
  },
  {
    value: "openrouter/free",
    label: "openrouter/free",
    command: "openrouter/free",
    description: "Free tier model via OpenRouter API",
  },
  {
    value: "llama3",
    label: "llama3",
    command: "llama3",
    description: "Meta LLaMA 3 model (local Ollama or OpenRouter)",
  },
];

export const SETTING_SUBCOMMANDS: SuggestionItem[] = [
  {
    value: "show",
    label: "show",
    command: "show",
    description: "Display current configuration and active limits",
  },
  {
    value: "memory",
    label: "memory",
    command: "memory",
    description: "Configure memory context window trimming limit",
  },
  {
    value: "steps",
    label: "steps",
    command: "steps",
    description: "Configure maximum autonomous agent inspection steps",
  },
  {
    value: "voice",
    label: "voice",
    command: "voice",
    description: "Toggle Japanese TTS audio engine on or off",
  },
];

export const SETTING_MEMORY_SUBCOMMANDS: SuggestionItem[] = [
  {
    value: "amnesia",
    label: "amnesia",
    command: "amnesia",
    description: "Extreme economy mode (10 messages limit)",
  },
  {
    value: "default",
    label: "default",
    command: "default",
    description: "Balanced mode (40 messages limit)",
  },
  {
    value: "focus",
    label: "focus",
    command: "focus",
    description: "Full context mode (100 messages limit)",
  },
];

export const SETTING_STEPS_SUBCOMMANDS: SuggestionItem[] = [
  {
    value: "15",
    label: "15",
    command: "15",
    description: "Quick analysis (15 steps)",
  },
  {
    value: "25",
    label: "25",
    command: "25",
    description: "Standard balanced audit (25 steps - recommended)",
  },
  {
    value: "40",
    label: "40",
    command: "40",
    description: "Deep repository audit (40 steps)",
  },
];

export const SETTING_VOICE_SUBCOMMANDS: SuggestionItem[] = [
  {
    value: "on",
    label: "on",
    command: "on",
    description: "Enable VOICEVOX speech synthesis",
  },
  {
    value: "off",
    label: "off",
    command: "off",
    description: "Text-only responses",
  },
];

export const TOP_LEVEL_COMMANDS: SuggestionItem[] = SLASH_COMMANDS.map((c) => ({
  value: c.command,
  label: c.command,
  command: c.command,
  syntax: c.syntax,
  description: c.description,
}));

const ZERO_ARG_COMMANDS = new Set([
  "/help",
  "/clear",
  "/exit",
  "/undo",
  "/retry",
  "/paste",
]);

const ALL_COMMAND_NAMES = new Set([
  "/help",
  "/setting",
  "/settings",
  "/persona",
  "/model",
  "/provider",
  "/api",
  "/undo",
  "/session",
  "/paste",
  "/retry",
  "/clear",
  "/exit",
]);

export function getContextualSuggestions(
  input: string,
  customSessions?: string[]
): SuggestionResult {
  if (!input.startsWith("/")) {
    return { title: "Available Commands", items: [] };
  }

  const trimmed = input.trim();
  const endsWithSpace = input.endsWith(" ");
  const parts = trimmed ? trimmed.split(/\s+/) : [];
  const baseCmd = parts[0]?.toLowerCase() || "";

  // Level 1: Typing top-level command without space yet (e.g. "/", "/p", "/setting")
  if (parts.length === 1 && !endsWithSpace) {
    const query = baseCmd;
    const items =
      query === "/"
        ? [...TOP_LEVEL_COMMANDS]
        : TOP_LEVEL_COMMANDS.filter((cmd) =>
            cmd.value.toLowerCase().startsWith(query)
          );
    return { title: "Available Commands", items };
  }

  // Non-matching command (e.g. /coba, /xyz)
  if (!ALL_COMMAND_NAMES.has(baseCmd)) {
    return { title: "Available Commands", items: [] };
  }

  // Zero-argument commands: dismiss immediately if trailing space or arguments exist
  if (ZERO_ARG_COMMANDS.has(baseCmd)) {
    return { title: "Available Commands", items: [] };
  }

  // Level 2: /persona <name> (1 argument)
  if (baseCmd === "/persona") {
    if (parts.length > 2 || (parts.length === 2 && endsWithSpace)) {
      return { title: "Select Persona", items: [] };
    }
    const query = parts.length === 2 && !endsWithSpace ? parts[1].toLowerCase() : "";
    const items = query
      ? PERSONA_SUBCOMMANDS.filter((p) => p.value.toLowerCase().startsWith(query))
      : [...PERSONA_SUBCOMMANDS];
    return { title: "Select Persona", items };
  }

  // Level 2 & 3: /setting [memory|steps|voice|show]
  if (baseCmd === "/setting" || baseCmd === "/settings") {
    if (parts.length === 1 && endsWithSpace) {
      return { title: "Settings Menu", items: [...SETTING_SUBCOMMANDS] };
    }

    if (parts.length === 2 && !endsWithSpace) {
      const query = parts[1].toLowerCase();
      const items = SETTING_SUBCOMMANDS.filter((s) =>
        s.value.toLowerCase().startsWith(query)
      );
      return { title: "Settings Menu", items };
    }

    const subToken = parts[1]?.toLowerCase();

    if (subToken === "show") {
      return { title: "Settings Menu", items: [] };
    }

    if (subToken === "memory") {
      if (parts.length > 3 || (parts.length === 3 && endsWithSpace)) {
        return { title: "Select Memory Mode", items: [] };
      }
      const query = parts.length === 3 && !endsWithSpace ? parts[2].toLowerCase() : "";
      const items = query
        ? SETTING_MEMORY_SUBCOMMANDS.filter((m) =>
            m.value.toLowerCase().startsWith(query)
          )
        : [...SETTING_MEMORY_SUBCOMMANDS];
      return { title: "Select Memory Mode", items };
    }

    if (subToken === "steps") {
      if (parts.length > 3 || (parts.length === 3 && endsWithSpace)) {
        return { title: "Select Max Autonomous Steps", items: [] };
      }
      const query = parts.length === 3 && !endsWithSpace ? parts[2].toLowerCase() : "";
      const items = query
        ? SETTING_STEPS_SUBCOMMANDS.filter((s) =>
            s.value.toLowerCase().startsWith(query)
          )
        : [...SETTING_STEPS_SUBCOMMANDS];
      return { title: "Select Max Autonomous Steps", items };
    }

    if (subToken === "voice") {
      if (parts.length > 3 || (parts.length === 3 && endsWithSpace)) {
        return { title: "Toggle Voice Synthesis", items: [] };
      }
      const query = parts.length === 3 && !endsWithSpace ? parts[2].toLowerCase() : "";
      const items = query
        ? SETTING_VOICE_SUBCOMMANDS.filter((v) =>
            v.value.toLowerCase().startsWith(query)
          )
        : [...SETTING_VOICE_SUBCOMMANDS];
      return { title: "Toggle Voice Synthesis", items };
    }

    return { title: "Settings Menu", items: [] };
  }

  // Level 2 & 3: /provider [fallback]
  if (baseCmd === "/provider") {
    if (parts.length === 1 && endsWithSpace) {
      return { title: "Select Provider", items: [...PROVIDER_SUBCOMMANDS] };
    }

    if (parts.length === 2 && !endsWithSpace) {
      const query = parts[1].toLowerCase();
      const items = PROVIDER_SUBCOMMANDS.filter((p) =>
        p.value.toLowerCase().startsWith(query)
      );
      return { title: "Select Provider", items };
    }

    const subToken = parts[1]?.toLowerCase();
    if (subToken === "fallback") {
      if (parts.length > 3 || (parts.length === 3 && endsWithSpace)) {
        return { title: "Select Fallback Provider", items: [] };
      }
      const query = parts.length === 3 && !endsWithSpace ? parts[2].toLowerCase() : "";
      const items = query
        ? FALLBACK_PROVIDER_SUBCOMMANDS.filter((p) =>
            p.value.toLowerCase().startsWith(query)
          )
        : [...FALLBACK_PROVIDER_SUBCOMMANDS];
      return { title: "Select Fallback Provider", items };
    }

    // Single-argument provider (e.g. /provider google )
    return { title: "Select Provider", items: [] };
  }

  // Level 2 & 3: /session [load|save|list]
  if (baseCmd === "/session") {
    if (parts.length === 1 && endsWithSpace) {
      return { title: "Session Commands", items: [...SESSION_SUBCOMMANDS] };
    }

    if (parts.length === 2 && !endsWithSpace) {
      const query = parts[1].toLowerCase();
      const items = SESSION_SUBCOMMANDS.filter((s) =>
        s.value.toLowerCase().startsWith(query)
      );
      return { title: "Session Commands", items };
    }

    const subToken = parts[1]?.toLowerCase();
    if (subToken === "load") {
      if (parts.length > 3 || (parts.length === 3 && endsWithSpace)) {
        return { title: "Select Saved Session", items: [] };
      }

      const availableSessions = customSessions || listSessionsSync();
      const sessionItems: SuggestionItem[] = availableSessions.map((name) => ({
        value: name,
        label: name,
        command: name,
        description: `Saved session: ${name}`,
      }));

      const query = parts.length === 3 && !endsWithSpace ? parts[2].toLowerCase() : "";
      const items = query
        ? sessionItems.filter((s) => s.value.toLowerCase().startsWith(query))
        : sessionItems;
      return { title: "Select Saved Session", items };
    }

    // /session save [name] or /session list
    return { title: "Session Commands", items: [] };
  }

  // Level 2: /api <provider> <key>
  if (baseCmd === "/api") {
    if (parts.length > 2 || (parts.length === 2 && endsWithSpace)) {
      // Secret API key being typed
      return { title: "Select Provider for API Key", items: [] };
    }
    const query = parts.length === 2 && !endsWithSpace ? parts[1].toLowerCase() : "";
    const items = query
      ? API_SUBCOMMANDS.filter((a) => a.value.toLowerCase().startsWith(query))
      : [...API_SUBCOMMANDS];
    return { title: "Select Provider for API Key", items };
  }

  // Level 2: /model <name> (1 argument)
  if (baseCmd === "/model") {
    if (parts.length > 2 || (parts.length === 2 && endsWithSpace)) {
      return { title: "Model Suggestions", items: [] };
    }
    const query = parts.length === 2 && !endsWithSpace ? parts[1].toLowerCase() : "";
    const items = query
      ? MODEL_SUGGESTIONS.filter((m) => m.value.toLowerCase().startsWith(query))
      : [...MODEL_SUGGESTIONS];
    return { title: "Model Suggestions", items };
  }

  return { title: "Available Commands", items: [] };
}

export function filterSlashCommands(
  input: string,
  customSessions?: string[]
): SuggestionItem[] {
  return getContextualSuggestions(input, customSessions).items;
}

export function getNextIndex(
  current: number,
  total: number,
  direction: "up" | "down"
): number {
  if (total <= 0) return 0;
  if (direction === "down") {
    return (current + 1) % total;
  }
  return (current - 1 + total) % total;
}

export function completeSlashCommand(
  input: string,
  selectedItem: SuggestionItem | SlashCommand
): string {
  const value = "value" in selectedItem ? selectedItem.value : selectedItem.command;

  // If completing a top-level slash command
  if (value.startsWith("/")) {
    const parts = input.split(/\s+/);
    if (parts.length <= 1) {
      return value + " ";
    }
    return `${value} ${parts.slice(1).join(" ")}`;
  }

  // Sub-option completion
  const trimmed = input.trimEnd();
  const endsWithSpace = input.endsWith(" ");
  const parts = input.trim().split(/\s+/);

  if (endsWithSpace || parts.length <= 1) {
    return `${trimmed} ${value}`;
  } else {
    parts[parts.length - 1] = value;
    return parts.join(" ");
  }
}
