import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import * as readline from "readline/promises";
import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";

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
      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
      return `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
    } catch (err: any) {
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

    onPauseSpinner();
    let answer = "n";
    try {
      console.log(""); 
      const promptText = chalk.yellow(`⚠️  Elenalyse is requesting to WRITE file: ${chalk.bold(filePath)}\nAllow execution? [Y/n]: `);
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
      const absolutePath = path.resolve(process.cwd(), filePath);
      
      const relative = path.relative(process.cwd(), absolutePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return "Error: Path traversal detected. Access denied.";
      }

      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, "utf-8");
      return `File successfully written to ${filePath}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  }
});

export const createEditFileTool = (onPauseSpinner: () => void, onResumeSpinner: () => void, rlInterface?: any) => tool({
  description: "Edit an existing file by replacing a specific block of text with new text. YOU MUST USE THIS TOOL TO EDIT FILES INSTEAD OF OUTPUTTING CODE BLOCKS.",
  parameters: z.object({
    filePath: z.string().describe("The relative path to the file, e.g., 'src/index.ts'"),
    targetText: z.string().describe("The exact text in the file you want to replace. Must match exactly."),
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
      const absolutePath = path.resolve(process.cwd(), filePath);
      
      const relative = path.relative(process.cwd(), absolutePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return "Error: Path traversal detected. Access denied.";
      }

      const content = await fs.readFile(absolutePath, "utf-8");
      
      if (!content.includes(targetText)) {
        return `Error: The targetText was not found in the file. Make sure you included the exact indentation and whitespace. Remember that the targetText must be an EXACT substring match of the file's current content.`;
      }
      
      const newContent = content.replace(targetText, replacementText);
      await fs.writeFile(absolutePath, newContent, "utf-8");
      
      return `File successfully edited. Replaced the specified text block in ${filePath}.`;
    } catch (error: any) {
      return `Error editing file: ${error.message}`;
    }
  }
});
