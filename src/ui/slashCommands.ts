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

export const TOP_LEVEL_COMMANDS: SuggestionItem[] = SLASH_COMMANDS.map((c) => ({
  value: c.command,
  label: c.command,
  command: c.command,
  syntax: c.syntax,
  description: c.description,
}));

export function getContextualSuggestions(
  input: string,
  customSessions?: string[]
): SuggestionResult {
  if (!input.startsWith("/")) {
    return { title: "Available Commands", items: [] };
  }

  const raw = input.trimStart();
  const endsWithSpace = input.endsWith(" ");
  const tokens = raw.split(/\s+/);
  const baseCmd = tokens[0]?.toLowerCase();

  // Level 1: Typing top-level command
  if (tokens.length === 1 && !endsWithSpace) {
    const query = baseCmd;
    const items =
      query === "/"
        ? [...TOP_LEVEL_COMMANDS]
        : TOP_LEVEL_COMMANDS.filter((cmd) =>
            cmd.value.toLowerCase().startsWith(query)
          );
    return { title: "Available Commands", items };
  }

  // Level 2: /persona
  if (baseCmd === "/persona") {
    const query = endsWithSpace
      ? tokens.length > 2
        ? tokens[tokens.length - 1].toLowerCase()
        : ""
      : tokens[1]?.toLowerCase() || "";
    const items = query
      ? PERSONA_SUBCOMMANDS.filter((p) => p.value.toLowerCase().startsWith(query))
      : [...PERSONA_SUBCOMMANDS];
    return { title: "Select Persona", items };
  }

  // Level 2 & 3: /provider [fallback]
  if (baseCmd === "/provider") {
    const subToken = tokens[1]?.toLowerCase();
    if (subToken === "fallback") {
      // Level 3: /provider fallback ...
      if (tokens.length === 2 && !endsWithSpace) {
        // Still typing "fallback"
        return {
          title: "Select Provider",
          items: PROVIDER_SUBCOMMANDS.filter((p) =>
            p.value.toLowerCase().startsWith("fallback")
          ),
        };
      }
      const query = endsWithSpace
        ? tokens.length > 3
          ? tokens[tokens.length - 1].toLowerCase()
          : ""
        : tokens[2]?.toLowerCase() || "";
      const items = query
        ? FALLBACK_PROVIDER_SUBCOMMANDS.filter((p) =>
            p.value.toLowerCase().startsWith(query)
          )
        : [...FALLBACK_PROVIDER_SUBCOMMANDS];
      return { title: "Select Fallback Provider", items };
    }

    // Level 2: /provider ...
    const query = endsWithSpace
      ? tokens.length > 2
        ? tokens[tokens.length - 1].toLowerCase()
        : ""
      : tokens[1]?.toLowerCase() || "";
    const items = query
      ? PROVIDER_SUBCOMMANDS.filter((p) =>
          p.value.toLowerCase().startsWith(query)
        )
      : [...PROVIDERER_SUBCOMMANDS(query)];
    return { title: "Select Provider", items };
  }

  // Level 2 & 3: /session [load|save|list]
  if (baseCmd === "/session") {
    const subToken = tokens[1]?.toLowerCase();
    if (subToken === "load") {
      // Level 3: /session load ...
      if (tokens.length === 2 && !endsWithSpace) {
        return {
          title: "Session Commands",
          items: SESSION_SUBCOMMANDS.filter((s) =>
            s.value.toLowerCase().startsWith("load")
          ),
        };
      }

      const availableSessions = customSessions || listSessionsSync();
      const sessionItems: SuggestionItem[] = availableSessions.map((name) => ({
        value: name,
        label: name,
        command: name,
        description: `Saved session: ${name}`,
      }));

      const query = endsWithSpace
        ? tokens.length > 3
          ? tokens[tokens.length - 1].toLowerCase()
          : ""
        : tokens[2]?.toLowerCase() || "";

      const items = query
        ? sessionItems.filter((s) => s.value.toLowerCase().startsWith(query))
        : sessionItems;
      return { title: "Select Saved Session", items };
    }

    // Level 2: /session ...
    const query = endsWithSpace
      ? tokens.length > 2
        ? tokens[tokens.length - 1].toLowerCase()
        : ""
      : tokens[1]?.toLowerCase() || "";
    const items = query
      ? SESSION_SUBCOMMANDS.filter((s) => s.value.toLowerCase().startsWith(query))
      : [...SESSION_SUBCOMMANDS];
    return { title: "Session Commands", items };
  }

  // Level 2: /api
  if (baseCmd === "/api") {
    const query = endsWithSpace
      ? tokens.length > 2
        ? tokens[tokens.length - 1].toLowerCase()
        : ""
      : tokens[1]?.toLowerCase() || "";
    const items = query
      ? API_SUBCOMMANDS.filter((a) => a.value.toLowerCase().startsWith(query))
      : [...API_SUBCOMMANDS];
    return { title: "Select Provider for API Key", items };
  }

  // Level 2: /model
  if (baseCmd === "/model") {
    const query = endsWithSpace
      ? tokens.length > 2
        ? tokens[tokens.length - 1].toLowerCase()
        : ""
      : tokens[1]?.toLowerCase() || "";
    const items = query
      ? MODEL_SUGGESTIONS.filter((m) => m.value.toLowerCase().startsWith(query))
      : [...MODEL_SUGGESTIONS];
    return { title: "Model Suggestions", items };
  }

  return { title: "Available Commands", items: [] };
}

function PROVIDERER_SUBCOMMANDS(query: string): SuggestionItem[] {
  return query
    ? PROVIDER_SUBCOMMANDS.filter((p) => p.value.toLowerCase().startsWith(query))
    : [...PROVIDER_SUBCOMMANDS];
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

  if (endsWithSpace) {
    return `${trimmed} ${value}`;
  } else {
    parts[parts.length - 1] = value;
    return parts.join(" ");
  }
}
