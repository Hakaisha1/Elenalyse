import { describe, it, expect } from "vitest";
import { pruneMemoryToolResults, isToolResultMessage } from "../src/memoryPruner.js";

describe("Smart Memory Compression & Tool Result Pruner", () => {
  describe("isToolResultMessage", () => {
    it("identifies native tool role messages", () => {
      expect(isToolResultMessage({ role: "tool", content: "output" })).toBe(true);
      expect(isToolResultMessage({ role: "tool-result", content: "output" })).toBe(true);
    });

    it("identifies text-based tool result messages", () => {
      expect(
        isToolResultMessage({
          role: "user",
          content: '[System Tool Result for "readFile"]:\nconsole.log("hello");',
        })
      ).toBe(true);
      expect(
        isToolResultMessage({
          role: "user",
          content: "[Previous Tool Result: readFile(src/index.ts) - 10 lines inspected in prior turn]",
        })
      ).toBe(true);
    });

    it("returns false for regular conversational user and assistant messages", () => {
      expect(isToolResultMessage({ role: "user", content: "Please review my code" })).toBe(false);
      expect(isToolResultMessage({ role: "assistant", content: "I found 2 bugs in the controller" })).toBe(false);
    });
  });

  describe("Preserving Conversational History", () => {
    it("preserves conversational user and assistant messages across all turns", () => {
      const messages = [
        { role: "user", content: "Turn 1: How does authentication work?" },
        { role: "assistant", content: "Turn 1: It uses JWT tokens stored in cookies." },
        { role: "user", content: "Turn 2: Can we switch to session tokens?" },
        { role: "assistant", content: "Turn 2: Yes, by setting up Redis session storage." },
        { role: "user", content: "Turn 3: Show me the configuration." },
      ];

      const pruned = pruneMemoryToolResults(messages, 2);
      expect(pruned).toEqual(messages);
    });
  });

  describe("Pruning Old Tool Results & Preserving Recent Turns", () => {
    it("preserves large tool results from recent turns (within retainRecentTurns)", () => {
      const largeContent = "const data = " + "x".repeat(300) + ";\nline 2\nline 3";
      const messages = [
        { role: "user", content: "Inspect database configuration" },
        { role: "assistant", content: '<tool_call><function=readFile><parameter=path>src/db.ts</parameter></function></tool_call>' },
        {
          role: "user",
          content: `[System Tool Result for "readFile"]:\n${largeContent}\n\nPlease proceed with your analysis.`,
        },
        { role: "assistant", content: "The database configuration is standard." },
        { role: "user", content: "Now check the server setup" },
      ];

      // Since there are only 2 user turns, all tool results are within recent turns (retainRecentTurns = 2)
      const pruned = pruneMemoryToolResults(messages, 2);
      expect(pruned[2].content).toContain(largeContent);
    });

    it("compresses large text tool results from older turns into concise summary markers", () => {
      const largeFile1 = "function init() {\n" + "  const a = 1;\n".repeat(40) + "}";
      const largeFile2 = "function handle() {\n" + "  const b = 2;\n".repeat(30) + "}";

      const messages = [
        // Turn 1 (Old)
        { role: "user", content: "Inspect auth service" },
        {
          role: "assistant",
          content: '<tool_call><function=readFile><parameter=filePath>src/auth.ts</parameter></function></tool_call>',
        },
        {
          role: "user",
          content: `[System Tool Result for "readFile"]:\n${largeFile1}\n\nPlease proceed.`,
        },
        { role: "assistant", content: "Auth service inspected." },

        // Turn 2 (Recent turn 1 of 2)
        { role: "user", content: "Inspect payment service" },
        {
          role: "assistant",
          content: '<tool_call><function=readFile><parameter=filePath>src/payment.ts</parameter></function></tool_call>',
        },
        {
          role: "user",
          content: `[System Tool Result for "readFile"]:\n${largeFile2}\n\nPlease proceed.`,
        },
        { role: "assistant", content: "Payment service inspected." },

        // Turn 3 (Recent turn 2 of 2 - active)
        { role: "user", content: "Summarize everything" },
      ];

      const pruned = pruneMemoryToolResults(messages, 2);

      // Turn 1 tool result should be compressed
      expect(pruned[2].content).toContain("[Previous Tool Result: readFile(src/auth.ts)");
      expect(pruned[2].content).toContain("lines inspected in prior turn]");
      expect(pruned[2].content).not.toContain("const a = 1;");

      // Turn 2 tool result should be preserved uncompressed
      expect(pruned[6].content).toContain(largeFile2);

      // Conversational messages are completely preserved
      expect(pruned[0].content).toBe("Inspect auth service");
      expect(pruned[3].content).toBe("Auth service inspected.");
      expect(pruned[4].content).toBe("Inspect payment service");
      expect(pruned[7].content).toBe("Payment service inspected.");
      expect(pruned[8].content).toBe("Summarize everything");
    });

    it("does not compress small tool results (<= 200 chars) even from older turns", () => {
      const shortOutput = "File successfully written: src/config.json";
      const messages = [
        // Turn 1 (Old)
        { role: "user", content: "Write config file" },
        {
          role: "user",
          content: `[System Tool Result for "writeFile"]:\n${shortOutput}`,
        },
        { role: "assistant", content: "Done." },

        // Turn 2
        { role: "user", content: "Next task" },
        { role: "assistant", content: "Ready." },

        // Turn 3
        { role: "user", content: "Final task" },
      ];

      const pruned = pruneMemoryToolResults(messages, 2);
      expect(pruned[1].content).toContain(shortOutput);
    });

    it("compresses native AI SDK tool results from older turns", () => {
      const largeNativeResult = "{\n" + '  "key": "value",\n'.repeat(30) + "}";
      const messages = [
        // Turn 1 (Old)
        { role: "user", content: "Search codebase" },
        {
          role: "assistant",
          toolCalls: [{ toolName: "searchCode", args: { query: "useAuth" } }],
        },
        {
          role: "tool",
          toolName: "searchCode",
          result: largeNativeResult,
        },
        { role: "assistant", content: "Found 3 occurrences." },

        // Turn 2
        { role: "user", content: "Second turn" },
        { role: "assistant", content: "Done." },

        // Turn 3
        { role: "user", content: "Third turn" },
      ];

      const pruned = pruneMemoryToolResults(messages, 2);
      expect(pruned[2].result).toContain("[Previous Tool Result: searchCode(useAuth)");
      expect(pruned[2].result).toContain("lines inspected in prior turn]");
      expect(pruned[2].result).not.toContain('"key": "value"');
    });

    it("handles empty or single turn conversation gracefully", () => {
      expect(pruneMemoryToolResults([])).toEqual([]);
      const single = [{ role: "user", content: "Hello" }];
      expect(pruneMemoryToolResults(single)).toEqual(single);
    });
  });
});
