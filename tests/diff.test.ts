import { describe, it, expect } from "vitest";
import {
  computeLineDiff,
  buildHunks,
  generateUnifiedDiff,
  renderNewFilePreview,
} from "../src/ui/diff.js";

describe("Visual Unified Diff Engine", () => {
  describe("Line Diff Computation", () => {
    it("computes line additions correctly", () => {
      const oldText = "line 1\nline 2";
      const newText = "line 1\nline 1.5\nline 2";
      const diff = computeLineDiff(oldText, newText);

      expect(diff).toEqual([
        { type: "unchanged", line: "line 1" },
        { type: "added", line: "line 1.5" },
        { type: "unchanged", line: "line 2" },
      ]);
    });

    it("computes line deletions correctly", () => {
      const oldText = "line 1\nline to delete\nline 2";
      const newText = "line 1\nline 2";
      const diff = computeLineDiff(oldText, newText);

      expect(diff).toEqual([
        { type: "unchanged", line: "line 1" },
        { type: "deleted", line: "line to delete" },
        { type: "unchanged", line: "line 2" },
      ]);
    });

    it("computes replacements as deletion followed by addition", () => {
      const oldText = "export const PI = 3.14;";
      const newText = "export const PI = 3.14159265;";
      const diff = computeLineDiff(oldText, newText);

      expect(diff).toEqual([
        { type: "deleted", line: "export const PI = 3.14;" },
        { type: "added", line: "export const PI = 3.14159265;" },
      ]);
    });

    it("handles empty or identical files gracefully", () => {
      expect(computeLineDiff("", "")).toEqual([]);

      const same = "const a = 1;\nconst b = 2;";
      const diff = computeLineDiff(same, same);
      expect(diff.every((d) => d.type === "unchanged")).toBe(true);
    });
  });

  describe("Hunk Builder", () => {
    it("builds unified diff hunks with correct line numbers", () => {
      const oldContent = "line 1\nline 2\nline 3\nline 4\nline 5";
      const newContent = "line 1\nline 2\nMODIFIED 3\nline 4\nline 5";
      const diff = computeLineDiff(oldContent, newContent);
      const hunks = buildHunks(diff, 2);

      expect(hunks.length).toBeGreaterThan(0);
      const first = hunks[0];
      expect(first.lines.some((l) => l.line === "MODIFIED 3" && l.type === "added")).toBe(true);
      expect(first.lines.some((l) => l.line === "line 3" && l.type === "deleted")).toBe(true);
    });

    it("returns empty array when there are no changes", () => {
      const diff = computeLineDiff("constant text", "constant text");
      expect(buildHunks(diff)).toEqual([]);
    });
  });

  describe("Boxed Container & Visual Output Formatting", () => {
    it("renders unified diff inside rounded box container with filename header", () => {
      const oldText = "function greet() {\n  return 'hello';\n}";
      const newText = "function greet() {\n  return 'hello world';\n}";
      const diffBox = generateUnifiedDiff("src/greet.ts", oldText, newText);

      expect(diffBox).toContain("Proposed Changes: src/greet.ts");
      expect(diffBox).toContain("╭──");
      expect(diffBox).toContain("╰──");
      expect(diffBox).toContain("@@");
      expect(diffBox).toContain("-   return 'hello';");
      expect(diffBox).toContain("+   return 'hello world';");
    });

    it("displays notice when no content changes are detected", () => {
      const text = "unchanged code";
      const diffBox = generateUnifiedDiff("file.txt", text, text);

      expect(diffBox).toContain("Proposed Changes: file.txt");
      expect(diffBox).toContain("No content changes detected");
    });

    it("renders new file preview container with addition prefixes", () => {
      const content = "import express from 'express';\nconst app = express();\nexport default app;";
      const preview = renderNewFilePreview("src/server.ts", content, 2);

      expect(preview).toContain("New File: src/server.ts");
      expect(preview).toContain("+ import express from 'express';");
      expect(preview).toContain("+ const app = express();");
      expect(preview).toContain("... (1 more lines hidden)");
    });
  });
});
