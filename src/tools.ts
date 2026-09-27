import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import * as readline from "readline/promises";
import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";

const execAsync = promisify(exec);

export const readFileTool = tool({
  description: "Read the contents of a file in the user's workspace.",
  parameters: z.object({
    filePath: z.string().describe("The relative path to the file to read, e.g., 'src/index.ts'"),
  }),
  // @ts-ignore - Ignore inference failure in this environment
  execute: async ({ filePath }: { filePath?: string }) => {
    try {
      if (!filePath) return "Error: filePath argument is required.";
      const absolutePath = path.resolve(process.cwd(), filePath);
      
      const relative = path.relative(process.cwd(), absolutePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return "Error: Path traversal detected. Access denied.";
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
  }),
  // @ts-ignore - Ignore inference failure in this environment
  execute: async ({ dirPath }: { dirPath?: string }) => {
    try {
      const targetPath = dirPath || ".";
      const absolutePath = path.resolve(process.cwd(), targetPath);

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

export const createRunCommandTool = (onPauseSpinner: () => void, onResumeSpinner: () => void) => tool({
  description: "Execute a terminal/shell command on the user's system. IMPORTANT: The user is on a WINDOWS system. You MUST use Windows PowerShell/CMD syntax (e.g., use 'del' instead of 'rm', 'mkdir' without '-p', 'type nul > file.txt' instead of 'touch', and 'dir' instead of 'ls').",
  parameters: z.object({
    command: z.string().describe("The bash/powershell command to execute"),
  }),
  // @ts-ignore
  execute: async ({ command }: { command: string }) => {
    onPauseSpinner();
    
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let answer = "n";
    try {
      console.log(""); // Newline for clean output
      answer = await rl.question(chalk.yellow(`⚠️  Elenalyse is requesting to run command:\n> ${chalk.bold(command)}\nAllow execution? [Y/n]: `));
    } finally {
      rl.close();
      onResumeSpinner();
    }

    if (answer.toLowerCase() !== 'y') {
      return "Execution denied by the user. Ask the user for alternative approaches.";
    }

    try {
      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
      return `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
    } catch (err: any) {
      return `Error executing command: ${err.message}`;
    }
  }
});
