import { describe, it, expect } from "vitest";
import { renderMarkdown, highlightSyntax, renderCodeBlock } from "../src/ui/markdown.js";

describe("Terminal Markdown & Syntax Highlighting Engine", () => {
  describe("Inline & Block Markdown Rendering", () => {
    it("renders top-level headers (#) with dividers and accent icons", () => {
      const output = renderMarkdown("# Architecture Overview");
      expect(output).toContain("■ Architecture Overview");
      expect(output).toContain("───");
    });

    it("renders second and third level headers (##, ###) with distinct icons", () => {
      const output = renderMarkdown("## Section Details\n### Minor Subsection");
      expect(output).toContain("◆ Section Details");
      expect(output).toContain("▸ Minor Subsection");
    });

    it("formats bold and italic text styles", () => {
      const boldOutput = renderMarkdown("This is **critical** information.");
      expect(boldOutput).toContain("critical");

      const italicOutput = renderMarkdown("This is *emphasized* text.");
      expect(italicOutput).toContain("emphasized");
    });

    it("formats inline code with distinct formatting", () => {
      const output = renderMarkdown("Call `getUserById(id)` to retrieve user data.");
      expect(output).toContain("`getUserById(id)`");
    });

    it("formats unordered bullet points with clean bullet markers", () => {
      const output = renderMarkdown("- First task\n* Second task\n+ Third task");
      expect(output).toContain("• First task");
      expect(output).toContain("• Second task");
      expect(output).toContain("• Third task");
    });

    it("formats ordered numbered lists cleanly", () => {
      const output = renderMarkdown("1. Initialize database\n2. Run migrations");
      expect(output).toContain("1. Initialize database");
      expect(output).toContain("2. Run migrations");
    });

    it("formats blockquotes with bar prefix", () => {
      const output = renderMarkdown("> Note: Ensure API keys are kept secure.");
      expect(output).toContain("│");
      expect(output).toContain("Note: Ensure API keys are kept secure.");
    });
  });

  describe("Code Block Box Container & Language Headers", () => {
    it("renders boxed container with language header for fenced code blocks", () => {
      const md = "```typescript\nconst message: string = 'Hello World';\n```";
      const output = renderMarkdown(md);

      expect(output).toContain("┌─ [typescript]");
      expect(output).toContain("const message: string = 'Hello World';");
      expect(output).toContain("└");
    });

    it("defaults to [text] or [code] when no language tag is provided", () => {
      const md = "```\nPlain text output\n```";
      const output = renderMarkdown(md);

      expect(output).toContain("┌─ [text]");
      expect(output).toContain("Plain text output");
      expect(output).toContain("└");
    });

    it("preserves code block content without applying markdown formatting inside", () => {
      const md = "```markdown\n# This is not an H1\n* Neither is this a bullet\n```";
      const output = renderMarkdown(md);

      expect(output).toContain("# This is not an H1");
      expect(output).toContain("* Neither is this a bullet");
      // Does not replace with ■ or • inside the code block
      expect(output).not.toContain("■ This is not an H1");
    });
  });

  describe("Syntax Highlighting Engine", () => {
    it("highlights TypeScript keywords and types", () => {
      const code = "async function fetchData(): Promise<string> {\n  return 'data';\n}";
      const highlighted = highlightSyntax(code, "typescript");

      expect(highlighted).toContain("async");
      expect(highlighted).toContain("function");
      expect(highlighted).toContain("return");
      expect(highlighted).toContain("'data'");
    });

    it("highlights Python keywords and literals", () => {
      const code = "def compute_sum(a: int) -> int:\n    if a > 0:\n        return True\n    return False";
      const highlighted = highlightSyntax(code, "python");

      expect(highlighted).toContain("def");
      expect(highlighted).toContain("return");
      expect(highlighted).toContain("True");
      expect(highlighted).toContain("False");
    });

    it("highlights SQL keywords", () => {
      const code = "SELECT id, name FROM users WHERE active = 1;";
      const highlighted = highlightSyntax(code, "sql");

      expect(highlighted).toContain("SELECT");
      expect(highlighted).toContain("FROM");
      expect(highlighted).toContain("WHERE");
    });

    it("highlights diff output lines with additions, deletions, and hunk headers", () => {
      const diff = "@@ -1,3 +1,3 @@\n- old line\n+ new line\n  context line";
      const highlighted = highlightSyntax(diff, "diff");

      expect(highlighted).toContain("- old line");
      expect(highlighted).toContain("+ new line");
      expect(highlighted).toContain("@@ -1,3 +1,3 @@");
    });
  });
});
