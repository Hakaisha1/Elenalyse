import { describe, it, expect } from "vitest";
import {
  extractTextToolCalls,
  stripToolCallTags,
  normalizeToolArgs,
  canonicalToolName,
} from "../src/toolParser.js";
import {
  executeToolDirectly,
  formatToolArgs,
  MAX_AUTONOMOUS_STEPS,
} from "../src/chat.js";
import { getPersonaPrompt } from "../src/personas.js";

describe("Autonomous Agent Tool Parser & Normalizer", () => {
  describe("XML Tool Call Parsing", () => {
    it("parses single parameter XML tool call (OpenRouter Nemotron format)", () => {
      const xml = `<tool_call>
<function=listDir>
<parameter=path>
.
</parameter>
</function>
</tool_call>`;

      const { cleanedText, toolCalls } = extractTextToolCalls(xml);
      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].toolName).toBe("listDir");
      expect(toolCalls[0].args).toEqual({ dirPath: "." });
      expect(cleanedText).toBe("");
    });

    it("parses multiple parameter XML tool call", () => {
      const xml = `I will search for the configuration file now.
<tool_call>
<function=searchCode>
<parameter=query>
fallbackProvider
</parameter>
<parameter=filePattern>
*.ts
</parameter>
</function>
</tool_call>
Let me know if you need more details.`;

      const { cleanedText, toolCalls } = extractTextToolCalls(xml);
      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].toolName).toBe("searchCode");
      expect(toolCalls[0].args).toEqual({
        query: "fallbackProvider",
        filePattern: "*.ts",
      });
      expect(cleanedText).toContain("I will search for the configuration file now.");
      expect(cleanedText).toContain("Let me know if you need more details.");
      expect(cleanedText).not.toContain("<tool_call>");
    });

    it("parses multiple tool calls in a single response", () => {
      const xml = `<tool_call>
<function=gitStatus>
</function>
</tool_call>
<tool_call>
<function=findFiles>
<parameter=pattern>
*.json
</parameter>
</function>
</tool_call>`;

      const { toolCalls } = extractTextToolCalls(xml);
      expect(toolCalls.length).toBe(2);
      expect(toolCalls[0].toolName).toBe("gitStatus");
      expect(toolCalls[1].toolName).toBe("findFiles");
      expect(toolCalls[1].args).toEqual({ pattern: "*.json" });
    });

    it("parses XML format with quotes or name attributes", () => {
      const xml = `<tool_call>
<function name="readFile">
<parameter name="filePath">
src/index.ts
</parameter>
</function>
</tool_call>`;

      const { toolCalls } = extractTextToolCalls(xml);
      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].toolName).toBe("readFile");
      expect(toolCalls[0].args).toEqual({ filePath: "src/index.ts" });
    });
  });

  describe("JSON Tool Call Fallback Parsing", () => {
    it("parses JSON tool call inside <tool_call> tag", () => {
      const json = `<tool_call>{"name": "gitDiff", "arguments": {"staged": true}}</tool_call>`;
      const { toolCalls } = extractTextToolCalls(json);

      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].toolName).toBe("gitDiff");
      expect(toolCalls[0].args).toEqual({ staged: true });
    });

    it("parses JSON tool call inside markdown code blocks", () => {
      const markdown = "I will check the directory contents:\n```json\n{\n  \"tool\": \"listDir\",\n  \"args\": {\n    \"path\": \"src\"\n  }\n}\n```";
      const { toolCalls } = extractTextToolCalls(markdown);

      expect(toolCalls.length).toBe(1);
      expect(toolCalls[0].toolName).toBe("listDir");
      expect(toolCalls[0].args).toEqual({ dirPath: "src" });
    });
  });

  describe("Parameter Normalization", () => {
    it("normalizes path to dirPath for listDir", () => {
      const normalized = normalizeToolArgs("listDir", { path: "src" });
      expect(normalized).toEqual({ dirPath: "src" });
    });

    it("normalizes path, file, filename to filePath for readFile and editFile", () => {
      expect(normalizeToolArgs("readFile", { path: "src/chat.ts" })).toEqual({
        filePath: "src/chat.ts",
      });
      expect(normalizeToolArgs("readFile", { file: "package.json" })).toEqual({
        filePath: "package.json",
      });
      expect(normalizeToolArgs("editFile", { filename: "src/tools.ts" })).toEqual({
        filePath: "src/tools.ts",
      });
    });

    it("normalizes code/text to content for writeFile", () => {
      expect(normalizeToolArgs("writeFile", { filePath: "test.txt", code: "const a = 1;" })).toEqual({
        filePath: "test.txt",
        content: "const a = 1;",
      });
      expect(normalizeToolArgs("writeFile", { path: "test.txt", text: "hello" })).toEqual({
        filePath: "test.txt",
        content: "hello",
      });
    });

    it("normalizes search/oldText and replace/newText for editFile", () => {
      const normalized = normalizeToolArgs("editFile", {
        path: "src/a.ts",
        search: "old",
        replace: "new",
      });
      expect(normalized).toEqual({
        filePath: "src/a.ts",
        targetText: "old",
        replacementText: "new",
      });
    });
  });

  describe("stripToolCallTags", () => {
    it("strips tool call tags and leaves surrounding text clean", () => {
      const raw = `Analysis started.
<tool_call>
<function=listDir>
<parameter=path>
.
</parameter>
</function>
</tool_call>
Analysis finished.`;

      const stripped = stripToolCallTags(raw);
      expect(stripped).toContain("Analysis started.");
      expect(stripped).toContain("Analysis finished.");
      expect(stripped).not.toContain("<tool_call>");
      expect(stripped).not.toContain("<function=");
      expect(stripped).not.toContain("</function>");
    });

    it("handles text with no tool tags gracefully", () => {
      const normal = "This is a clean markdown response without tool tags.";
      expect(stripToolCallTags(normal)).toBe(normal);
      expect(stripToolCallTags("")).toBe("");
    });
  });

  describe("canonicalToolName", () => {
    it("maps lowercase or slightly malformed names to camelCase standard", () => {
      expect(canonicalToolName("listdir")).toBe("listDir");
      expect(canonicalToolName("readfile")).toBe("readFile");
      expect(canonicalToolName("searchcode")).toBe("searchCode");
      expect(canonicalToolName("findfiles")).toBe("findFiles");
      expect(canonicalToolName("gitstatus")).toBe("gitStatus");
      expect(canonicalToolName("gitdiff")).toBe("gitDiff");
      expect(canonicalToolName("writefile")).toBe("writeFile");
      expect(canonicalToolName("editfile")).toBe("editFile");
      expect(canonicalToolName("runcommand")).toBe("runCommand");
    });
  });

  describe("formatToolArgs", () => {
    it("formats empty args as empty string", () => {
      expect(formatToolArgs({})).toBe("");
    });

    it("formats single and multiple args cleanly", () => {
      expect(formatToolArgs({ dirPath: "." })).toBe("dirPath=.");
      expect(formatToolArgs({ query: "token", filePattern: "*.ts" })).toBe("query=token, filePattern=*.ts");
    });

    it("truncates very long parameter values for clean progress display", () => {
      const longVal = "a".repeat(40);
      const formatted = formatToolArgs({ path: longVal });
      expect(formatted).toContain("path=aaaaaaaaaaaaaaaaaaaaaa...");
      expect(formatted.length).toBeLessThan(35);
    });
  });

  describe("executeToolDirectly", () => {
    it("executes registered tool with normalized args", async () => {
      let receivedArgs: any = null;
      const mockTools: Record<string, any> = {
        listDir: {
          execute: async (args: any) => {
            receivedArgs = args;
            return "file1.ts\nfile2.ts";
          },
        },
      };

      const result = await executeToolDirectly("listdir", { path: "src" }, mockTools);
      expect(result).toBe("file1.ts\nfile2.ts");
      expect(receivedArgs).toEqual({ dirPath: "src" });
    });

    it("serializes non-string return values to JSON", async () => {
      const mockTools: Record<string, any> = {
        gitStatus: {
          execute: async () => ({ clean: true, branch: "main" }),
        },
      };

      const result = await executeToolDirectly("gitStatus", {}, mockTools);
      expect(result).toContain('"clean": true');
      expect(result).toContain('"branch": "main"');
    });

    it("returns error string when tool is unknown or unsupported", async () => {
      const result = await executeToolDirectly("unknownMagicTool", {}, {});
      expect(result).toContain("Error: Unknown or unsupported tool 'unknownMagicTool'.");
    });

    it("catches thrown errors during tool execution gracefully", async () => {
      const mockTools: Record<string, any> = {
        readFile: {
          execute: async () => {
            throw new Error("Disk read failure");
          },
        },
      };

      const result = await executeToolDirectly("readFile", { filePath: "src/foo.ts" }, mockTools);
      expect(result).toContain("Error executing readFile: Disk read failure");
    });
  });

  describe("Autonomous Analysis Protocol & Configuration", () => {
    it("exports MAX_AUTONOMOUS_STEPS set to 25", () => {
      expect(MAX_AUTONOMOUS_STEPS).toBe(25);
    });

    it("injects [AUTONOMOUS ANALYSIS PROTOCOL] directive into persona prompts", async () => {
      const personas = ["eli", "rei", "sora", "rin"] as const;
      for (const p of personas) {
        const prompt = await getPersonaPrompt(p);
        expect(prompt).toContain("[AUTONOMOUS ANALYSIS PROTOCOL]");
        expect(prompt).toContain("You MUST execute the necessary tools immediately.");
      }
    });
  });
});
