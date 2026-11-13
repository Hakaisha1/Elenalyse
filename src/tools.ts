import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import * as readline from "readline/promises";
import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";
import { recordSnapshot } from "./undo.js";

const execAsync = promisify(exec);

const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg', '.mp3', '.mp4', '.wav', '.ogg', '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.pdf', '.woff', '.woff2', '.ttf', '.eot']);
const MAX_FILE_SIZE = 50 * 1024; // 50KB
const MAX_OUTPUT_CHARS = 5000;

export const readFileTool = tool({
  description: "Read the contents of a file in the user's workspace. Returns an error for binary files or files larger than 50KB.",
  parameters: z.object({
    filePath: z.string().describe("The relative path to the file to read, e.g., 'src/index.ts'"),
  }).passthrough(),
  // @ts-ignore - Ignore inference failure in this environment
  execute: async (args: any) => {
    try {
      const filePath = args.filePath || args.path || args.file || args.filename;
      if (!filePath) return "Error: filePath argument is required.";

      const ext = path.extname(filePath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        return `Error: '${filePath}' is a binary file (${ext}). This tool only reads text files.`;
      }

      const absolutePath = path.resolve(process.cwd(), filePath);
      
      const relative = path.relative(process.cwd(), absolutePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return "Error: Path traversal detected. Access denied.";
      }

      const stat = await fs.stat(absolutePath);
      if (stat.size > MAX_FILE_SIZE) {
        return `Error: File is too large (${(stat.size / 1024).toFixed(1)}KB). Maximum allowed is ${MAX_FILE_SIZE / 1024}KB. Consider reading a specific section or using a smaller file.`;
      }

      const content = await fs.readFile(absolutePath, "utf-8");
      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  },
});


export const listDirTool = tool({
  description: "List all files and directories in a given path.",
  parameters: z.object({
    dirPath: z.string().describe("The relative path to the directory to list, e.g., '.' for current directory"),
  }).passthrough(),
  // @ts-ignore - Ignore inference failure in this environment
  execute: async (args: any) => {
    try {
      const dirPath = args.dirPath || args.path || args.directory || args.dir || ".";
      const absolutePath = path.resolve(process.cwd(), dirPath);

      const relative = path.relative(process.cwd(), absolutePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return "Error: Path traversal detected. Access denied.";
      }

      const files = await fs.readdir(absolutePath, { withFileTypes: true });
      return files.map((f) => (f.isDirectory() ? `[DIR] ${f.name}` : f.name)).join("\n");
    } catch (error: any) {
      return `Error listing directory: ${error.message}`;
    }
  },
});

export const gitStatusTool = tool({
  description: "Get the current git repository status in short format (git status -s). Read-only operation.",
  parameters: z.object({}).passthrough(),
  // @ts-ignore
  execute: async () => {
    try {
      const { stdout, stderr } = await execAsync("git status -s", { cwd: process.cwd(), timeout: 10000 });
      if (stderr && !stdout) {
        return `Git status error: ${stderr}`;
      }
      return stdout.trim() ? stdout : "Working tree clean, nothing to commit.";
    } catch (err: any) {
      return `Error executing git status: ${err.message}`;
    }
  },
});

export const gitDiffTool = tool({
  description: "View git diff of modified files (unstaged by default, or staged if requested). Read-only operation.",
  parameters: z.object({
    staged: z.boolean().optional().describe("If true, view staged changes (--staged/--cached)"),
    filePath: z.string().optional().describe("Optional specific file path to diff"),
  }).passthrough(),
  // @ts-ignore
  execute: async (args: any) => {
    try {
      const staged = Boolean(args?.staged);
      const filePath = args?.filePath || args?.file || args?.path;

      let cmd = "git diff";
      if (staged) {
        cmd += " --staged";
      }
      if (filePath) {
        cmd += ` -- "${filePath.replace(/"/g, '\\"')}"`;
      }

      const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd(), timeout: 15000 });
      if (stderr && !stdout) {
        return `Git diff error: ${stderr}`;
      }
      if (!stdout.trim()) {
        return staged ? "No staged changes found." : "No unstaged changes found.";
      }
      const truncate = (s: string) =>
        s.length > MAX_OUTPUT_CHARS
          ? s.slice(0, MAX_OUTPUT_CHARS) + `\n...[Output truncated. Total length: ${s.length} chars]`
          : s;
      return truncate(stdout);
    } catch (err: any) {
      return `Error executing git diff: ${err.message}`;
    }
  },
});

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".vscode",
  ".idea",
]);

export function matchesPattern(filename: string, pattern: string): boolean {
  if (!pattern || pattern === "*") return true;
  const basename = path.basename(filename);
  if (pattern.includes("*") || pattern.includes("?")) {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    const regex = new RegExp(`^${escaped}$`, "i");
    return regex.test(filename) || regex.test(basename);
  }
  return (
    filename.toLowerCase().includes(pattern.toLowerCase()) ||
    basename.toLowerCase().includes(pattern.toLowerCase())
  );
}

async function collectFiles(
  dir: string,
  baseDir: string = dir,
  results: string[] = []
): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await collectFiles(path.join(dir, entry.name), baseDir, results);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!BINARY_EXTENSIONS.has(ext)) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
          results.push(relPath);
        }
      }
    }
  } catch {}
  return results;
}

export interface SearchMatch {
  filePath: string;
  line: number;
  snippet: string;
}

export async function searchCode(
  query: string,
  options?: { isRegex?: boolean; filePattern?: string; rootDir?: string }
): Promise<SearchMatch[]> {
  const rootDir = options?.rootDir || process.cwd();
  const allFiles = await collectFiles(rootDir, rootDir);
  const matches: SearchMatch[] = [];

  let regex: RegExp;
  if (options?.isRegex) {
    try {
      regex = new RegExp(query, "i");
    } catch {
      regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
  } else {
    regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  for (const relPath of allFiles) {
    if (options?.filePattern && !matchesPattern(relPath, options.filePattern)) {
      continue;
    }

    const fullPath = path.resolve(rootDir, relPath);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.size > MAX_FILE_SIZE) continue;

      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            filePath: relPath,
            line: i + 1,
            snippet: lines[i].trim(),
          });
          if (matches.length >= 50) return matches;
        }
      }
    } catch {}
  }

  return matches;
}

export async function findFiles(
  pattern: string,
  rootDir: string = process.cwd()
): Promise<string[]> {
  const allFiles = await collectFiles(rootDir, rootDir);
  const matches = allFiles.filter((relPath) => matchesPattern(relPath, pattern));
  return matches.slice(0, 100);
}

export const searchCodeTool = tool({
  description: "Fast recursive search for text or regex across files in the current workspace. Ignores build and node_modules directories.",
  parameters: z.object({
    query: z.string().describe("The text or regex to search for"),
    isRegex: z.boolean().optional().describe("Whether to treat the query as a regular expression"),
    filePattern: z.string().optional().describe("Optional glob or pattern to filter files, e.g. '*.ts' or 'src/*'"),
  }).passthrough(),
  // @ts-ignore
  execute: async (args: any) => {
    try {
      const query = args?.query || args?.search || args?.text;
      if (!query) return "Error: query parameter is required.";

      const matches = await searchCode(query, {
        isRegex: Boolean(args?.isRegex),
        filePattern: args?.filePattern || args?.pattern,
      });

      if (matches.length === 0) {
        return `No matches found for '${query}'.`;
      }

      const formatted = matches
        .map((m) => `${m.filePath}:${m.line}: ${m.snippet}`)
        .join("\n");

      if (formatted.length > MAX_OUTPUT_CHARS) {
        return formatted.slice(0, MAX_OUTPUT_CHARS) + `\n...[Output truncated. Total matches: ${matches.length}]`;
      }

      return formatted;
    } catch (err: any) {
      return `Error searching code: ${err.message}`;
    }
  },
});

export const findFilesTool = tool({
  description: "Find files by filename or glob pattern (e.g. '*.test.ts', '*config*'). Ignores node_modules, git, and dist directories.",
  parameters: z.object({
    pattern: z.string().describe("The glob or substring pattern to match files against, e.g. '*.ts' or '*config*'"),
  }).passthrough(),
  // @ts-ignore
  execute: async (args: any) => {
    try {
      const pattern = args?.pattern || args?.glob || args?.file || "*";
      const files = await findFiles(pattern);

      if (files.length === 0) {
        return `No files found matching '${pattern}'.`;
      }

      const formatted = files.join("\n");
      if (formatted.length > MAX_OUTPUT_CHARS) {
        return formatted.slice(0, MAX_OUTPUT_CHARS) + `\n...[Output truncated. Total files: ${files.length}]`;
      }

      return formatted;
    } catch (err: any) {
      return `Error finding files: ${err.message}`;
    }
  },
});

export const createRunCommandTool = (onPauseSpinner: () => void, onResumeSpinner: () => void, rlInterface?: any) => {
  const isWindows = process.platform === "win32";
  const osContext = isWindows 
    ? "IMPORTANT: The user is on a WINDOWS system. You MUST use Windows PowerShell/CMD syntax (e.g., use 'del' instead of 'rm', 'type nul > file.txt' instead of 'touch', and 'dir' instead of 'ls')."
    : `IMPORTANT: The user is on a POSIX/UNIX system (${process.platform}). You MUST use standard bash/unix syntax.`;
    
  return tool({
    description: `Execute a terminal/shell command on the user's system. ${osContext}`,
    parameters: z.object({
      command: z.string().describe("The command to execute"),
    }),
  // @ts-ignore
  execute: async ({ command }: { command: string }) => {
    onPauseSpinner();
    
    let answer = "n";
    try {
      console.log(""); // Newline for clean output
      const promptText = chalk.yellow(`⚠️  Elenalyse is requesting to run command:\n> ${chalk.bold(command)}\nAllow execution? [Y/n]: `);
      if (rlInterface) {
        rlInterface.resume();
        answer = await rlInterface.question(promptText);
        rlInterface.pause();
      } else {
        const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
        answer = await tempRl.question(promptText);
        tempRl.close();
      }
    } finally {
      onResumeSpinner();
    }

    if (answer.toLowerCase() !== 'y') {
      return "Execution denied by the user. Ask the user for alternative approaches.";
    }

    try {
      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd(), timeout: 30000 });
      const truncate = (s: string) => s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + `\n...[Output truncated. Total length: ${s.length} chars]` : s;
      return `STDOUT:\n${truncate(stdout)}\nSTDERR:\n${truncate(stderr)}`;
    } catch (err: any) {
      if (err.killed) {
        return `Error: Command timed out after 30 seconds and was killed. The command may be a long-running process (e.g., a dev server). Inform the user.`;
      }
      return `Error executing command: ${err.message}\nIf this is a syntax error, remember you are on ${process.platform}. Use appropriate shell commands.`;
    }
  }
});
};

export const createWriteFileTool = (onPauseSpinner: () => void, onResumeSpinner: () => void, rlInterface?: any) => tool({
  description: "Create a new file or completely overwrite an existing file with new content. YOU MUST USE THIS TOOL TO CREATE FILES INSTEAD OF OUTPUTTING CODE BLOCKS.",
  parameters: z.object({
    filePath: z.string().describe("The relative path to the file, e.g., 'src/utils.ts'"),
    content: z.string().describe("The complete content to write to the file"),
  }).passthrough(),
  // @ts-ignore
  execute: async (args: any) => {
    const filePath = args.filePath || args.path || args.file || args.filename;
    const content = args.content || args.code || args.text;

    if (!filePath || content === undefined) {
      return "Error: You must provide both 'filePath' and 'content' arguments to use this tool.";
    }

    const absolutePath = path.resolve(process.cwd(), filePath);
    const relative = path.relative(process.cwd(), absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return "Error: Path traversal detected. Access denied.";
    }

    // Check if file already exists to warn user
    let fileExists = false;
    let existingSize = 0;
    try {
      const stat = await fs.stat(absolutePath);
      fileExists = true;
      existingSize = stat.size;
    } catch {}

    onPauseSpinner();
    let answer = "n";
    try {
      console.log(""); 
      const action = fileExists ? "OVERWRITE" : "CREATE";
      const sizeInfo = fileExists 
        ? ` (existing: ${(existingSize / 1024).toFixed(1)}KB → new: ${(Buffer.byteLength(content) / 1024).toFixed(1)}KB)`
        : ` (${(Buffer.byteLength(content) / 1024).toFixed(1)}KB)`;
      const promptText = chalk.yellow(`⚠️  Elenalyse is requesting to ${chalk.bold(action)} file: ${chalk.bold(filePath)}${sizeInfo}\nAllow execution? [Y/n]: `);
      if (rlInterface) {
        rlInterface.resume();
        answer = await rlInterface.question(promptText);
        rlInterface.pause();
      } else {
        const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
        answer = await tempRl.question(promptText);
        tempRl.close();
      }
    } finally {
      onResumeSpinner();
    }

    if (answer.toLowerCase() !== 'y') {
      return "File write denied by the user.";
    }

    try {
      await recordSnapshot(filePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, "utf-8");
      return `File successfully ${fileExists ? "overwritten" : "created"}: ${filePath}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  }
});

export function applyFileEdit(
  content: string,
  targetText: string,
  replacementText: string
): { success: boolean; newContent?: string; error?: string } {
  // 1. Check for true exact match (verbatim including indentation and normalized line endings)
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const normalizedTarget = targetText.replace(/\r\n/g, "\n");
  const normalizedReplacement = replacementText.replace(/\r\n/g, "\n");

  let exactIndex = normalizedContent.indexOf(normalizedTarget);
  while (exactIndex !== -1) {
    const lineStart = normalizedContent.lastIndexOf("\n", exactIndex - 1) + 1;
    const prefix = normalizedContent.slice(lineStart, exactIndex);

    // If prefix is empty (starts at beginning of line) or contains non-whitespace (inline edit),
    // then it's a valid exact match.
    // If prefix is only whitespace (e.g. "        "), target was missing line indentation,
    // so line-trimmed matching should handle indentation preservation instead.
    const isIndentationMismatch = prefix.length > 0 && /^\s+$/.test(prefix);

    if (!isIndentationMismatch) {
      const newContent =
        normalizedContent.slice(0, exactIndex) +
        normalizedReplacement +
        normalizedContent.slice(exactIndex + normalizedTarget.length);
      const finalContent = content.includes("\r\n") ? newContent.replace(/\n/g, "\r\n") : newContent;
      return { success: true, newContent: finalContent };
    }

    exactIndex = normalizedContent.indexOf(normalizedTarget, exactIndex + 1);
  }

  // 2. Line-trimmed matching for indentation resilience
  const contentLines = normalizedContent.split("\n");
  const targetLines = normalizedTarget.split("\n");
  const trimmedTargetLines = targetLines.map((l) => l.trim());

  const firstNonEmptyTarget = targetLines.find((l) => l.trim().length > 0) || "";
  const targetBaseIndent = firstNonEmptyTarget.match(/^\s*/)?.[0] || "";

  let matchIndex = -1;
  for (let i = 0; i <= contentLines.length - targetLines.length; i++) {
    let matches = true;
    for (let j = 0; j < targetLines.length; j++) {
      if (contentLines[i + j].trim() !== trimmedTargetLines[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex !== -1) {
    const matchedContentLines = contentLines.slice(matchIndex, matchIndex + targetLines.length);
    const firstNonEmptyContent = matchedContentLines.find((l) => l.trim().length > 0) || "";
    const contentBaseIndent = firstNonEmptyContent.match(/^\s*/)?.[0] || "";

    const replacementLines = normalizedReplacement.split("\n");
    const adjustedReplacementLines = replacementLines.map((line) => {
      if (!line.trim()) return "";
      if (line.startsWith(targetBaseIndent)) {
        return contentBaseIndent + line.slice(targetBaseIndent.length);
      }
      return contentBaseIndent + line.trimStart();
    });

    contentLines.splice(matchIndex, targetLines.length, ...adjustedReplacementLines);
    const newContent = contentLines.join("\n");
    const finalContent = content.includes("\r\n") ? newContent.replace(/\n/g, "\r\n") : newContent;
    return { success: true, newContent: finalContent };
  }

  // 3. Fallback: return helpful error details
  const firstLines = contentLines.slice(0, 10).join("\n");
  return {
    success: false,
    error: `The targetText was not found in the file (even after normalizing line endings and trimming indentation).\nFirst 10 lines of file:\n---\n${firstLines}\n---\nTarget requested:\n---\n${normalizedTarget}\n---`,
  };
}

export const createEditFileTool = (onPauseSpinner: () => void, onResumeSpinner: () => void, rlInterface?: any) => tool({
  description: "Edit an existing file by replacing a specific block of text with new text. YOU MUST USE THIS TOOL TO EDIT FILES INSTEAD OF OUTPUTTING CODE BLOCKS. IMPORTANT: You MUST first read the file with readFile to know its exact current content before attempting an edit.",
  parameters: z.object({
    filePath: z.string().describe("The relative path to the file, e.g., 'src/index.ts'"),
    targetText: z.string().describe("The exact text in the file you want to replace. Must match exactly, including whitespace and indentation."),
    replacementText: z.string().describe("The new text to replace the target text with."),
  }).passthrough(),
  // @ts-ignore
  execute: async (args: any) => {
    const filePath = args.filePath || args.path || args.file || args.filename;
    const targetText = args.targetText || args.oldText || args.search;
    const replacementText = args.replacementText || args.newText || args.replace;

    if (!filePath || !targetText || replacementText === undefined) {
      return "Error: You must provide 'filePath', 'targetText', and 'replacementText' arguments to use this tool.";
    }

    const absolutePath = path.resolve(process.cwd(), filePath);
    const relative = path.relative(process.cwd(), absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return "Error: Path traversal detected. Access denied.";
    }

    onPauseSpinner();
    let answer = "n";
    try {
      console.log(""); 
      const promptText = chalk.yellow(`⚠️  Elenalyse is requesting to EDIT file: ${chalk.bold(filePath)}\nAllow execution? [Y/n]: `);
      if (rlInterface) {
        rlInterface.resume();
        answer = await rlInterface.question(promptText);
        rlInterface.pause();
      } else {
        const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
        answer = await tempRl.question(promptText);
        tempRl.close();
      }
    } finally {
      onResumeSpinner();
    }

    if (answer.toLowerCase() !== 'y') {
      return "File edit denied by the user.";
    }

    try {
      const content = await fs.readFile(absolutePath, "utf-8");
      const editResult = applyFileEdit(content, targetText, replacementText);

      if (!editResult.success || editResult.newContent === undefined) {
        return `Error: ${editResult.error || "The targetText was not found in the file."}`;
      }

      await recordSnapshot(filePath);
      await fs.writeFile(absolutePath, editResult.newContent, "utf-8");

      return `File successfully edited. Replaced the specified text block in ${filePath}.`;
    } catch (error: any) {
      return `Error editing file: ${error.message}`;
    }
  }
});
