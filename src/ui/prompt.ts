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
    let userNavigated = false;
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
        stdout.write("\r\x1b[J" + promptPrefix + buffer);
        const colOffset = promptLen + cursor;
        if (colOffset > 0) {
          stdout.write(`\r\x1b[${colOffset}C`);
        } else {
          stdout.write("\r");
        }
        previousDropdownHeight = 0;
      }
    };

    const render = () => {
      // 1. Clear everything from the prompt line downwards and redraw prompt line
      stdout.write("\r\x1b[J" + promptPrefix + buffer);

      // 2. If dropdown is active and there are items, draw them below and return cursor
      if (dropdownActive && filtered.length > 0) {
        const dropdownLines = renderDropdownLines(
          filtered,
          selectedIndex,
          dropdownTitle
        );
        previousDropdownHeight = dropdownLines.length;

        stdout.write("\n" + dropdownLines.join("\n"));
        // Move cursor back up to the prompt line
        stdout.write(`\x1b[${dropdownLines.length}A`);
      } else {
        previousDropdownHeight = 0;
      }

      // 3. Position cursor at the exact typing column on the prompt line
      const colOffset = promptLen + cursor;
      if (colOffset > 0) {
        stdout.write(`\r\x1b[${colOffset}C`);
      } else {
        stdout.write("\r");
      }
    };

    const updateDropdown = () => {
      if (buffer.startsWith("/")) {
        const res = getContextualSuggestions(buffer);
        dropdownTitle = res.title;
        filtered = res.items;

        const trimmed = buffer.trim();
        // Auto-dismiss if input already matches a single suggestion exactly
        const isExactMatch =
          filtered.length === 1 &&
          (trimmed === filtered[0].value || trimmed.endsWith(" " + filtered[0].value));

        dropdownActive = filtered.length > 0 && !isExactMatch;
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
      stdout.write("\r\x1b[J" + promptPrefix + buffer + "\n");
      stdin.removeListener("keypress", onKeypress);
      stdin.setRawMode(false);
    };

    const onKeypress = (str: string, key: any) => {
      if (!key) {
        if (str && str.length === 1) {
          buffer = buffer.slice(0, cursor) + str + buffer.slice(cursor);
          cursor++;
          userNavigated = false;
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
        userNavigated = false;
        render();
        return;
      }

      // Up arrow
      if (key.name === "up") {
        if (dropdownActive && filtered.length > 0) {
          userNavigated = true;
          selectedIndex = getNextIndex(selectedIndex, filtered.length, "up");
          render();
          return;
        }
      }

      // Down arrow
      if (key.name === "down") {
        if (dropdownActive && filtered.length > 0) {
          userNavigated = true;
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
          userNavigated = false;
          updateDropdown();
          render();
          return;
        }
      }

      // Enter key
      if (key.name === "return" || key.name === "enter") {
        // If dropdown is active and user actively navigated to an option with arrow keys
        if (
          dropdownActive &&
          userNavigated &&
          filtered.length > 0 &&
          !filtered.some((c) => buffer.trim().endsWith(c.value))
        ) {
          const chosen = filtered[selectedIndex];
          buffer = completeSlashCommand(buffer, chosen);
          cursor = buffer.length;
          userNavigated = false;
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
          userNavigated = false;
          updateDropdown();
          render();
        }
        return;
      }

      // Delete
      if (key.name === "delete") {
        if (cursor < buffer.length) {
          buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
          userNavigated = false;
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
        userNavigated = false;
        updateDropdown();
        render();
      }
    };

    stdin.on("keypress", onKeypress);
  });
}
