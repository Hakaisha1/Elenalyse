import readline from "readline";
import chalk from "chalk";
import {
  filterSlashCommands,
  getNextIndex,
  completeSlashCommand,
  SlashCommand,
  SLASH_COMMANDS,
} from "./slashCommands.js";

export interface PromptOptions {
  personaColor?: string;
}

export function renderDropdownLines(
  commands: SlashCommand[],
  selectedIndex: number,
  maxDisplay: number = 6
): string[] {
  if (commands.length === 0) return [];

  const displayCount = Math.min(commands.length, maxDisplay);
  const startIdx = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(displayCount / 2),
      commands.length - displayCount
    )
  );
  const slice = commands.slice(startIdx, startIdx + displayCount);

  const lines: string[] = [];
  lines.push(
    chalk.cyan(`  ╭─── Slash Commands (${commands.length}) ─────────────────────────╮`)
  );

  slice.forEach((cmd, i) => {
    const actualIdx = startIdx + i;
    const isSelected = actualIdx === selectedIndex;
    const pointer = isSelected ? chalk.magenta.bold("❯ ") : "  ";
    const cmdText = isSelected
      ? chalk.magenta.bold(cmd.command.padEnd(12))
      : chalk.white(cmd.command.padEnd(12));
    const descText = isSelected
      ? chalk.white(cmd.description.slice(0, 36))
      : chalk.gray(cmd.description.slice(0, 36));

    const content = `  │ ${pointer}${cmdText} ${descText}`;
    const plainLength = 4 + 2 + 12 + 1 + Math.min(cmd.description.length, 36);
    const padding = Math.max(0, 56 - plainLength);
    lines.push(content + " ".repeat(padding) + chalk.cyan("│"));
  });

  lines.push(
    chalk.cyan(`  ╰── [↑/↓ Navigate • Tab/Enter Select • Esc Close] ───╯`)
  );
  return lines;
}

export async function interactivePrompt(
  promptPrefix: string = chalk.green("👤 You ❯ "),
  _options?: PromptOptions
): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = (await import("readline")).createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question(promptPrefix, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    let buffer = "";
    let cursor = 0;
    let selectedIndex = 0;
    let dropdownActive = false;
    let filtered: SlashCommand[] = [];
    let previousDropdownHeight = 0;

    const rawPrompt = promptPrefix.replace(/\x1b\[[0-9;]*m/g, "");
    const promptLen = rawPrompt.length;

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();

    const clearDropdown = () => {
      if (previousDropdownHeight > 0) {
        for (let i = 0; i < previousDropdownHeight; i++) {
          stdout.write("\n\x1b[2K");
        }
        stdout.write(`\x1b[${previousDropdownHeight}A`);
        previousDropdownHeight = 0;
      }
    };

    const render = () => {
      clearDropdown();

      // Redraw prompt line
      stdout.write("\r\x1b[2K");
      stdout.write(promptPrefix + buffer);

      if (dropdownActive && filtered.length > 0) {
        const dropdownLines = renderDropdownLines(filtered, selectedIndex);
        previousDropdownHeight = dropdownLines.length;

        stdout.write("\n" + dropdownLines.join("\n"));
        // Move cursor back up to the prompt line and to the correct column
        stdout.write(`\x1b[${dropdownLines.length}A`);
        stdout.write(`\r\x1b[${promptLen + cursor}C`);
      } else {
        // Position cursor on prompt line
        stdout.write(`\r\x1b[${promptLen + cursor}C`);
      }
    };

    const updateDropdown = () => {
      if (buffer.startsWith("/")) {
        filtered = filterSlashCommands(buffer);
        dropdownActive = filtered.length > 0;
        if (selectedIndex >= filtered.length) {
          selectedIndex = 0;
        }
      } else {
        dropdownActive = false;
        filtered = [];
        selectedIndex = 0;
      }
    };

    render();

    const cleanup = () => {
      clearDropdown();
      stdin.removeListener("keypress", onKeypress);
      stdin.setRawMode(false);
      stdout.write("\n");
    };

    const onKeypress = (str: string, key: any) => {
      if (!key) {
        if (str && str.length === 1) {
          buffer = buffer.slice(0, cursor) + str + buffer.slice(cursor);
          cursor++;
          updateDropdown();
          render();
        }
        return;
      }

      // Ctrl + C
      if (key.ctrl && key.name === "c") {
        cleanup();
        process.exit(0);
      }

      // Ctrl + D
      if (key.ctrl && key.name === "d") {
        cleanup();
        resolve("/exit");
        return;
      }

      // Escape
      if (key.name === "escape") {
        dropdownActive = false;
        render();
        return;
      }

      // Up arrow
      if (key.name === "up") {
        if (dropdownActive && filtered.length > 0) {
          selectedIndex = getNextIndex(selectedIndex, filtered.length, "up");
          render();
          return;
        }
      }

      // Down arrow
      if (key.name === "down") {
        if (dropdownActive && filtered.length > 0) {
          selectedIndex = getNextIndex(selectedIndex, filtered.length, "down");
          render();
          return;
        }
      }

      // Tab key
      if (key.name === "tab") {
        if (dropdownActive && filtered.length > 0) {
          const chosen = filtered[selectedIndex];
          buffer = completeSlashCommand(buffer, chosen);
          cursor = buffer.length;
          dropdownActive = false;
          render();
          return;
        }
      }

      // Enter key
      if (key.name === "return" || key.name === "enter") {
        // If dropdown is active and user typed a partial command, complete it
        if (
          dropdownActive &&
          filtered.length > 0 &&
          !SLASH_COMMANDS.some((c) => c.command === buffer.trim())
        ) {
          const chosen = filtered[selectedIndex];
          buffer = completeSlashCommand(buffer, chosen);
          cursor = buffer.length;
          dropdownActive = false;
          render();
          return;
        }

        cleanup();
        resolve(buffer);
        return;
      }

      // Backspace
      if (key.name === "backspace") {
        if (cursor > 0) {
          buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
          cursor--;
          updateDropdown();
          render();
        }
        return;
      }

      // Delete
      if (key.name === "delete") {
        if (cursor < buffer.length) {
          buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
          updateDropdown();
          render();
        }
        return;
      }

      // Left arrow
      if (key.name === "left") {
        if (cursor > 0) {
          cursor--;
          render();
        }
        return;
      }

      // Right arrow
      if (key.name === "right") {
        if (cursor < buffer.length) {
          cursor++;
          render();
        }
        return;
      }

      // Normal character entry
      if (str && !key.ctrl && !key.meta) {
        buffer = buffer.slice(0, cursor) + str + buffer.slice(cursor);
        cursor += str.length;
        updateDropdown();
        render();
      }
    };

    stdin.on("keypress", onKeypress);
  });
}
