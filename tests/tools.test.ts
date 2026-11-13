import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  gitStatusTool,
  gitDiffTool,
  applyFileEdit,
  createEditFileTool,
} from "../src/tools.js";

describe("Native Git Tools", () => {
  it("gitStatusTool executes and returns string status without interactive prompt", async () => {
    // @ts-ignore
    const result = await gitStatusTool.execute({});
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("gitDiffTool executes unstaged diff by default", async () => {
    // @ts-ignore
    const result = await gitDiffTool.execute({});
    expect(typeof result).toBe("string");
  });

  it("gitDiffTool executes staged diff when staged is true", async () => {
    // @ts-ignore
    const result = await gitDiffTool.execute({ staged: true });
    expect(typeof result).toBe("string");
  });

  it("gitDiffTool supports querying a specific filePath", async () => {
    // @ts-ignore
    const result = await gitDiffTool.execute({ filePath: "package.json" });
    expect(typeof result).toBe("string");
  });
});

describe("applyFileEdit - Whitespace & Indentation Resilience", () => {
  it("performs exact matching and replacement", () => {
    const original = "const greeting = 'Hello';\nconsole.log(greeting);";
    const target = "const greeting = 'Hello';";
    const replacement = "const greeting = 'Hello, World!';";

    const result = applyFileEdit(original, target, replacement);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe("const greeting = 'Hello, World!';\nconsole.log(greeting);");
  });

  it("matches and replaces across CRLF vs LF line ending differences", () => {
    // File has CRLF line endings
    const originalCRLF = "line 1\r\nline 2\r\nline 3";
    // Target has LF line endings
    const targetLF = "line 2\nline 3";
    const replacement = "line two\nline three";

    const result = applyFileEdit(originalCRLF, targetLF, replacement);
    expect(result.success).toBe(true);
    expect(result.newContent).toBe("line 1\r\nline two\r\nline three");
  });

  it("matches by line-trimmed content and preserves original indentation structure", () => {
    const original = [
      "class Service {",
      "    execute() {",
      "        const a = 1;",
      "        const b = 2;",
      "        return a + b;",
      "    }",
      "}",
    ].join("\n");

    // Target with 0 indentation
    const targetUnindented = [
      "const a = 1;",
      "const b = 2;",
      "return a + b;",
    ].join("\n");

    // Replacement with 0 indentation
    const replacement = [
      "const a = 10;",
      "const b = 20;",
      "return a * b;",
    ].join("\n");

    const result = applyFileEdit(original, targetUnindented, replacement);
    expect(result.success).toBe(true);

    const expected = [
      "class Service {",
      "    execute() {",
      "        const a = 10;",
      "        const b = 20;",
      "        return a * b;",
      "    }",
      "}",
    ].join("\n");

    expect(result.newContent).toBe(expected);
  });

  it("preserves relative sub-indentation in replacement block when using line-trimmed matching", () => {
    const original = [
      "    function test() {",
      "        oldCode();",
      "    }",
    ].join("\n");

    const target = "oldCode();";
    const replacement = [
      "if (condition) {",
      "    newCode();",
      "}",
    ].join("\n");

    const result = applyFileEdit(original, target, replacement);
    expect(result.success).toBe(true);

    const expected = [
      "    function test() {",
      "        if (condition) {",
      "            newCode();",
      "        }",
      "    }",
    ].join("\n");

    expect(result.newContent).toBe(expected);
  });

  it("returns detailed error with preview when target cannot be matched", () => {
    const original = "alpha\nbeta\ngamma";
    const target = "omega";

    const result = applyFileEdit(original, target, "delta");
    expect(result.success).toBe(false);
    expect(result.error).toContain("targetText was not found");
    expect(result.error).toContain("First 10 lines of file");
  });
});

describe("createEditFileTool Integration with Whitespace Resilience", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "elenalyse-edit-test-"));
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("edits file successfully when indentation in target differs from file", async () => {
    const filePath = "src/code.ts";
    await fs.mkdir("src", { recursive: true });
    await fs.writeFile(
      filePath,
      "function run() {\n    const x = 5;\n    return x;\n}\n",
      "utf-8"
    );

    const fakeRl = {
      resume: () => {},
      pause: () => {},
      question: async () => "y",
    };

    const editTool = createEditFileTool(() => {}, () => {}, fakeRl);

    // Target has 2 spaces indentation instead of 4 spaces
    // @ts-ignore
    const result = await editTool.execute({
      filePath,
      targetText: "  const x = 5;\n  return x;",
      replacementText: "  const x = 100;\n  return x * 2;",
    });

    expect(result).toContain("File successfully edited");
    const updatedContent = await fs.readFile(filePath, "utf-8");
    expect(updatedContent).toBe("function run() {\n    const x = 100;\n    return x * 2;\n}\n");
  });
});
