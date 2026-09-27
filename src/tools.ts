import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

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
      const files = await fs.readdir(absolutePath, { withFileTypes: true });
      return files.map((f) => (f.isDirectory() ? `[DIR] ${f.name}` : f.name)).join("\n");
    } catch (error: any) {
      return `Error listing directory: ${error.message}`;
    }
  },
});
