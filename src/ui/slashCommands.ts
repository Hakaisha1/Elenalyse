export interface SlashCommand {
  command: string;
  syntax: string;
  description: string;
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
    description: "Change AI model (e.g. gemini-2.0-flash)",
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

export function filterSlashCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const cleanInput = input.trim().toLowerCase();
  if (cleanInput === "/") return [...SLASH_COMMANDS];
  const query = cleanInput.split(/\s+/)[0];
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().startsWith(query)
  );
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
  selectedCommand: SlashCommand
): string {
  const parts = input.split(/\s+/);
  if (parts.length <= 1) {
    return selectedCommand.command + " ";
  }
  return `${selectedCommand.command} ${parts.slice(1).join(" ")}`;
}
