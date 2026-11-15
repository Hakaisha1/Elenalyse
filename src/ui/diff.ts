import chalk from "chalk";

/**
 * Visual Unified Diff Preview Generator
 */

export interface DiffLine {
  type: "added" | "deleted" | "unchanged";
  line: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  if (!oldText && !newText) return [];
  if (!oldText) return newText.replace(/\r\n/g, "\n").split("\n").map((l) => ({ type: "added", line: l }));
  if (!newText) return oldText.replace(/\r\n/g, "\n").split("\n").map((l) => ({ type: "deleted", line: l }));

  const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");
  const newLines = newText.replace(/\r\n/g, "\n").split("\n");

  const m = oldLines.length;
  const n = newLines.length;

  // Trim common prefix
  let prefixCount = 0;
  while (prefixCount < m && prefixCount < n && oldLines[prefixCount] === newLines[prefixCount]) {
    prefixCount++;
  }

  // Trim common suffix
  let suffixCount = 0;
  while (
    suffixCount < m - prefixCount &&
    suffixCount < n - prefixCount &&
    oldLines[m - 1 - suffixCount] === newLines[n - 1 - suffixCount]
  ) {
    suffixCount++;
  }

  const midOld = oldLines.slice(prefixCount, m - suffixCount);
  const midNew = newLines.slice(prefixCount, n - suffixCount);
  const midM = midOld.length;
  const midN = midNew.length;

  const midDiff: DiffLine[] = [];

  if (midM === 0) {
    for (const line of midNew) midDiff.push({ type: "added", line });
  } else if (midN === 0) {
    for (const line of midOld) midDiff.push({ type: "deleted", line });
  } else if (midM * midN > 600000) {
    // Fallback for massive edits
    for (const line of midOld) midDiff.push({ type: "deleted", line });
    for (const line of midNew) midDiff.push({ type: "added", line });
  } else {
    // DP table for LCS
    const dp: number[][] = Array.from({ length: midM + 1 }, () => new Array(midN + 1).fill(0));
    for (let i = 1; i <= midM; i++) {
      for (let j = 1; j <= midN; j++) {
        if (midOld[i - 1] === midNew[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = midM;
    let j = midN;
    const backwards: DiffLine[] = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
        backwards.push({ type: "unchanged", line: midOld[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        backwards.push({ type: "added", line: midNew[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        backwards.push({ type: "deleted", line: midOld[i - 1] });
        i--;
      }
    }
    backwards.reverse();
    midDiff.push(...backwards);
  }

  const result: DiffLine[] = [];
  for (let k = 0; k < prefixCount; k++) {
    result.push({ type: "unchanged", line: oldLines[k] });
  }
  result.push(...midDiff);
  for (let k = m - suffixCount; k < m; k++) {
    result.push({ type: "unchanged", line: oldLines[k] });
  }

  return result;
}

export function buildHunks(diffLines: DiffLine[], context: number = 3): DiffHunk[] {
  const hasChanges = diffLines.some((d) => d.type !== "unchanged");
  if (!hasChanges) return [];

  const hunks: DiffHunk[] = [];
  let currentHunkLines: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;
  let hunkOldStart = 1;
  let hunkNewStart = 1;
  let hunkOldCount = 0;
  let hunkNewCount = 0;
  let unchangedStreak = 0;

  for (let i = 0; i < diffLines.length; i++) {
    const item = diffLines[i];

    if (item.type === "unchanged") {
      if (currentHunkLines.length > 0) {
        unchangedStreak++;
        currentHunkLines.push(item);
        hunkOldCount++;
        hunkNewCount++;

        // If we hit more than 2 * context unchanged lines, close hunk
        if (unchangedStreak > context * 2) {
          // Trim excess unchanged lines from hunk end
          const excess = unchangedStreak - context;
          const trimmedLines = currentHunkLines.slice(0, currentHunkLines.length - excess);
          hunkOldCount -= excess;
          hunkNewCount -= excess;
          hunks.push({
            oldStart: hunkOldStart,
            oldCount: hunkOldCount,
            newStart: hunkNewStart,
            newCount: hunkNewCount,
            lines: trimmedLines,
          });
          currentHunkLines = [];
          unchangedStreak = 0;
        }
      } else {
        // Collect leading context before a change
        // We track leading context dynamically
      }
      oldLineNum++;
      newLineNum++;
    } else {
      // Changed line (added or deleted)
      if (currentHunkLines.length === 0) {
        // Start new hunk, including up to `context` leading unchanged lines
        const leadStart = Math.max(0, i - context);
        const leadingUnchanged = diffLines.slice(leadStart, i);

        hunkOldStart = oldLineNum - leadingUnchanged.length;
        hunkNewStart = newLineNum - leadingUnchanged.length;
        hunkOldCount = leadingUnchanged.length;
        hunkNewCount = leadingUnchanged.length;

        currentHunkLines = [...leadingUnchanged];
      }

      currentHunkLines.push(item);
      if (item.type === "deleted") {
        hunkOldCount++;
        oldLineNum++;
      } else if (item.type === "added") {
        hunkNewCount++;
        newLineNum++;
      }
      unchangedStreak = 0;
    }
  }

  if (currentHunkLines.length > 0) {
    // Trim trailing unchanged lines beyond `context`
    if (unchangedStreak > context) {
      const excess = unchangedStreak - context;
      currentHunkLines = currentHunkLines.slice(0, currentHunkLines.length - excess);
      hunkOldCount -= excess;
      hunkNewCount -= excess;
    }
    hunks.push({
      oldStart: Math.max(1, hunkOldStart),
      oldCount: hunkOldCount,
      newStart: Math.max(1, hunkNewStart),
      newCount: hunkNewCount,
      lines: currentHunkLines,
    });
  }

  return hunks;
}

export function generateUnifiedDiff(
  filename: string,
  oldContent: string,
  newContent: string,
  context: number = 3
): string {
  const diffLines = computeLineDiff(oldContent, newContent);
  const hunks = buildHunks(diffLines, context);

  const title = `Proposed Changes: ${filename}`;
  const width = Math.max(70, title.length + 8);
  const topBorder =
    chalk.gray("╭── ") +
    chalk.bold.yellow(title) +
    " " +
    chalk.gray("─".repeat(Math.max(4, width - title.length - 7)) + "╮");
  const bottomBorder = chalk.gray("╰" + "─".repeat(width - 2) + "╯");

  if (hunks.length === 0) {
    const noChangeLine = chalk.gray("│ ") + chalk.dim("(No content changes detected)");
    return [topBorder, noChangeLine, bottomBorder].join("\n");
  }

  const outputLines: string[] = [topBorder];

  for (const hunk of hunks) {
    const header = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
    outputLines.push(chalk.gray("│ ") + chalk.cyan(header));

    for (const d of hunk.lines) {
      if (d.type === "added") {
        outputLines.push(chalk.gray("│ ") + chalk.green(`+ ${d.line}`));
      } else if (d.type === "deleted") {
        outputLines.push(chalk.gray("│ ") + chalk.red(`- ${d.line}`));
      } else {
        outputLines.push(chalk.gray("│ ") + chalk.gray(`  ${d.line}`));
      }
    }
  }

  outputLines.push(bottomBorder);
  return outputLines.join("\n");
}

export function renderNewFilePreview(
  filename: string,
  content: string,
  maxLines: number = 15
): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const totalLines = lines.length;
  const previewLines = lines.slice(0, maxLines);

  const title = `New File: ${filename}`;
  const width = Math.max(70, title.length + 8);
  const topBorder =
    chalk.gray("╭── ") +
    chalk.bold.green(title) +
    " " +
    chalk.gray("─".repeat(Math.max(4, width - title.length - 7)) + "╮");
  const bottomBorder = chalk.gray("╰" + "─".repeat(width - 2) + "╯");

  const outputLines: string[] = [topBorder];
  for (const l of previewLines) {
    outputLines.push(chalk.gray("│ ") + chalk.green(`+ ${l}`));
  }

  if (totalLines > maxLines) {
    outputLines.push(
      chalk.gray("│ ") + chalk.dim(`... (${totalLines - maxLines} more lines hidden)`)
    );
  }

  outputLines.push(bottomBorder);
  return outputLines.join("\n");
}
