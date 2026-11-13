import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  searchCode,
  findFiles,
  searchCodeTool,
  findFilesTool,
} from "../src/tools.js";
import { getProjectContext } from "../src/personas.js";

describe("Codebase Navigation & Project Awareness", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "elenalyse-nav-test-"));

    // Set up a mock repository structure
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "src", "nested"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "node_modules", "some-dep"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "dist"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });

    // Populate mock files
    await fs.writeFile(
      path.join(tempDir, "src", "index.ts"),
      "import { config } from './config.js';\nconsole.log('App starting');\nexport const app = 1;\n",
      "utf-8"
    );
    await fs.writeFile(
      path.join(tempDir, "src", "config.ts"),
      "export const config = { port: 3000, host: 'localhost' };\n",
      "utf-8"
    );
    await fs.writeFile(
      path.join(tempDir, "src", "nested", "helper.ts"),
      "export function helper() {\n  return 'helper-data';\n}\n",
      "utf-8"
    );
    await fs.writeFile(
      path.join(tempDir, "README.md"),
      "# Test App\nWelcome to Test App.\n",
      "utf-8"
    );
    // Ignored directory files (should NEVER be matched)
    await fs.writeFile(
      path.join(tempDir, "node_modules", "some-dep", "index.ts"),
      "console.log('Ignore me from node_modules');\n",
      "utf-8"
    );
    await fs.writeFile(
      path.join(tempDir, "dist", "bundle.js"),
      "console.log('Ignore me from dist');\n",
      "utf-8"
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe("searchCode", () => {
    it("searches code recursively and returns file, line, and snippet", async () => {
      const matches = await searchCode("App starting", { rootDir: tempDir });
      expect(matches.length).toBe(1);
      expect(matches[0].filePath).toBe("src/index.ts");
      expect(matches[0].line).toBe(2);
      expect(matches[0].snippet).toContain("App starting");
    });

    it("ignores node_modules and dist directories", async () => {
      const matches = await searchCode("Ignore me", { rootDir: tempDir });
      expect(matches.length).toBe(0);
    });

    it("supports regex queries", async () => {
      const matches = await searchCode("port:\\s*\\d+", {
        isRegex: true,
        rootDir: tempDir,
      });
      expect(matches.length).toBe(1);
      expect(matches[0].filePath).toBe("src/config.ts");
      expect(matches[0].line).toBe(1);
    });

    it("filters results by filePattern", async () => {
      const matches = await searchCode("App", {
        filePattern: "*.md",
        rootDir: tempDir,
      });
      expect(matches.length).toBe(2);
      expect(matches.every((m) => m.filePath.endsWith(".md"))).toBe(true);
    });
  });

  describe("findFiles", () => {
    it("finds files matching a glob pattern", async () => {
      const files = await findFiles("*.ts", tempDir);
      expect(files).toContain("src/index.ts");
      expect(files).toContain("src/config.ts");
      expect(files).toContain("src/nested/helper.ts");
      expect(files).not.toContain("node_modules/some-dep/index.ts");
      expect(files).not.toContain("dist/bundle.js");
    });

    it("matches substring patterns such as *config*", async () => {
      const files = await findFiles("*config*", tempDir);
      expect(files).toContain("src/config.ts");
      expect(files.length).toBe(1);
    });
  });

  describe("searchCodeTool & findFilesTool AI wrappers", () => {
    it("searchCodeTool returns formatted matches", async () => {
      // @ts-ignore
      const result = await searchCodeTool.execute({ query: "MemoryMode", filePattern: "*.ts" });
      expect(typeof result).toBe("string");
      expect(result).toContain("src/chat.ts");
    });

    it("findFilesTool returns matching file paths", async () => {
      // @ts-ignore
      const result = await findFilesTool.execute({ pattern: "*memory*" });
      expect(typeof result).toBe("string");
      expect(result).toContain("tests/memory.test.ts");
    });
  });

  describe("getProjectContext", () => {
    it("loads ELENALYSE.md when present", async () => {
      await fs.writeFile(
        path.join(tempDir, "ELENALYSE.md"),
        "# Custom Instructions\nStack: React + Node\n",
        "utf-8"
      );
      const ctx = getProjectContext(tempDir);
      expect(ctx).toContain("PROJECT CONTEXT (from ELENALYSE.md)");
      expect(ctx).toContain("Stack: React + Node");
    });

    it("caps ELENALYSE.md content at 2048 characters", async () => {
      const largeContent = "A".repeat(5000);
      await fs.writeFile(path.join(tempDir, "ELENALYSE.md"), largeContent, "utf-8");
      const ctx = getProjectContext(tempDir);
      expect(ctx).toContain("PROJECT CONTEXT (from ELENALYSE.md)");
      // Excludes header prefix in count
      const body = ctx.replace("[PROJECT CONTEXT (from ELENALYSE.md)]\n", "");
      expect(body.length).toBe(2048);
    });

    it("falls back to package.json when ELENALYSE.md is absent", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "awesome-tool",
          description: "A great tool",
          scripts: { test: "vitest", build: "tsc" },
        }),
        "utf-8"
      );
      const ctx = getProjectContext(tempDir);
      expect(ctx).toContain("PROJECT CONTEXT (from package.json)");
      expect(ctx).toContain("Project: awesome-tool - A great tool");
      expect(ctx).toContain('"test": "vitest"');
    });

    it("returns empty string when neither file is present", async () => {
      const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "elenalyse-empty-test-"));
      try {
        const ctx = getProjectContext(emptyDir);
        expect(ctx).toBe("");
      } finally {
        await fs.rm(emptyDir, { recursive: true, force: true });
      }
    });
  });
});
