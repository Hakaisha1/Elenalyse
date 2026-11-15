import readline from "readline";
import chalk from "chalk";
import {
  getContextualSuggestions,
  getNextIndex,
  completeSlashCommand,
  SuggestionItem,
} from "./slashCommands.js";

export interface PromptOptions {
  personaColor?: string;
}

export function renderDropdownLines(
  commands: SuggestionItem[],
  selectedIndex: number,
  title: string = "Slash Commands",
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
  const totalBoxWidth = 62;
  const headerPrefix = `  ╭─── ${title} (${commands.length}) `;
  const headerDashes = Math.max(2, totalBoxWidth - headerPrefix.length - 1);
  lines.push(chalk.cyan(headerPrefix + "─".repeat(headerDashes) + "╮"));

  slice.forEach((cmd, i) => {
    const actualIdx = startIdx + i;
    const isSelected = actualIdx === selectedIndex;
    const pointer = isSelected ? chalk.magenta.bold("❯ ") : "  ";
    const valText = isSelected
      ? chalk.magenta.bold(cmd.value.padEnd(16))
      : chalk.white(cmd.value.padEnd(16));
    const descText = isSelected
      ? chalk.white(cmd.description.slice(0, 36))
      : chalk.gray(cmd.description.slice(0, 36));

    const content = `  │ ${pointer}${valText} ${descText}`;
    const plainLength = 4 + 2 + 16 + 1 + Math.min(cmd.description.length, 36);
    const padding = Math.max(0, totalBoxWidth - 2 - plainLength);
    lines.push(content + " ".repeat(padding) + chalk.cyan("│"));
  });

  const footerText = "  ╰── [↑/↓ Navigate • Tab/Enter Select • Esc Close] ";
  const footerDashes = Math.max(2, totalBoxWidth - footerText.length - 1);
  lines.push(chalk.cyan(footerText + "─".repeat(footerDashes) + "╯"));
  return lines;
}

export async function interactivePrompt(
  promptPrefix: string = chalk.green("You ❯ "),
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
    let dropdownTitle = "Available Commands";
    let filtered: SuggestionItem[] = [];
    let previousDropdownHeight = 0;

    const rawPrompt = promptPrefix.replace(/\x1b\[[0-9;]*m/g, "");
    const promptLen = rawPrompt.length;

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();

    const clearDropdown = () => {
      if (previousDropdownHeight > 0) {
        stdout.write("\x1b[s\x1b[1B\x1b[J\x1b[u");
        previousDropdownHeight = 0;
      }
    };

    const render = () => {
      // Redraw prompt line
      stdout.write("\r\x1b[2K" + promptPrefix + buffer);

      if (dropdownActive && filtered.length > 0) {
        const dropdownLines = renderDropdownLines(
          filtered,
          selectedIndex,
          dropdownTitle
        );
        previousDropdownHeight = dropdownLines.length;

        stdout.write("\x1b[s");
        stdout.write("\n" + dropdownLines.join("\n") + "\x1b[J");
        stdout.write("\x1b[u");
        stdout.write(`\r\x1b[${promptLen + cursor}C`);
      } else {
        stdout.write("\x1b[s\x1b[1B\x1b[J\x1b[u");
        previousDropdownHeight = 0;
        stdout.write(`\r\x1b[${promptLen + cursor}C`);
      }
    };

    const updateDropdown = () => {
      if (buffer.startsWith("/")) {
        const res = getContextualSuggestions(buffer);
        dropdownTitle = res.title;
        filtered = res.items;
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
          updateDropdown();
          render();
          return;
        }
      }

      // Enter key
      if (key.name === "return" || key.name === "enter") {
        if (
          dropdownActive &&
          filtered.length > 0 &&
          !filtered.some((c) => buffer.trim().endsWith(c.value))
        ) {
          const chosen = filtered[selectedIndex];
          buffer = completeSlashCommand(buffer, chosen);
          cursor = buffer.length;
          updateDropdown();
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
