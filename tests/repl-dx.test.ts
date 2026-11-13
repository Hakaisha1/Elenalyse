import { describe, it, expect } from "vitest";
import { collectPasteLines, popLastTurnForRetry } from "../src/chat.js";

describe("REPL DX & Control", () => {
  describe("Multi-line Paste Mode (collectPasteLines)", () => {
    it("accumulates lines and submits when 'END' is entered", () => {
      const input = [
        "function calculate() {",
        "  const a = 10;",
        "  return a * 2;",
        "}",
        "END",
      ];
      const result = collectPasteLines(input);
      expect(result.action).toBe("submit");
      expect(result.text).toBe(
        "function calculate() {\n  const a = 10;\n  return a * 2;\n}"
      );
    });

    it("cancels paste mode when 'CANCEL' is entered", () => {
      const input = ["some draft text", "CANCEL"];
      const result = collectPasteLines(input);
      expect(result.action).toBe("cancel");
      expect(result.text).toBeUndefined();
    });

    it("handles case-insensitive 'end' and 'cancel'", () => {
      expect(collectPasteLines(["hello", "end"]).action).toBe("submit");
      expect(collectPasteLines(["hello", "cancel"]).action).toBe("cancel");
    });

    it("returns 'empty' when buffer has no non-whitespace text before 'END'", () => {
      const input = ["   ", "\t", "END"];
      const result = collectPasteLines(input);
      expect(result.action).toBe("empty");
    });

    it("returns 'empty' for empty input array", () => {
      const result = collectPasteLines([]);
      expect(result.action).toBe("empty");
    });
  });

  describe("Retry Command (popLastTurnForRetry)", () => {
    it("pops assistant reply and returns last user message for re-execution", () => {
      const messages = [
        { role: "user", content: "Explain closures" },
        { role: "assistant", content: "A closure is..." },
      ];

      const result = popLastTurnForRetry(messages);
      expect(result.success).toBe(true);
      expect(result.lastUserMessage).toBe("Explain closures");
      expect(messages.length).toBe(0);
    });

    it("pops multiple assistant or tool messages until finding the user prompt", () => {
      const messages = [
        { role: "user", content: "Initial message" },
        { role: "assistant", content: "Response 1" },
        { role: "user", content: "Second question" },
        { role: "tool", content: "Tool output" },
        { role: "assistant", content: "Response 2" },
      ];

      const result = popLastTurnForRetry(messages);
      expect(result.success).toBe(true);
      expect(result.lastUserMessage).toBe("Second question");

      // Prior history remains intact
      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe("Initial message");
      expect(messages[1].content).toBe("Response 1");
    });

    it("returns success: false when memory is empty", () => {
      const result = popLastTurnForRetry([]);
      expect(result.success).toBe(false);
    });

    it("returns success: false when no user messages exist in memory", () => {
      const messages = [
        { role: "system", content: "System prompt" },
        { role: "assistant", content: "Greetings" },
      ];
      const result = popLastTurnForRetry(messages);
      expect(result.success).toBe(false);
    });
  });

  describe("Graceful Abort Handling", () => {
    it("supports AbortController signal cancellation", () => {
      const controller = new AbortController();
      expect(controller.signal.aborted).toBe(false);

      controller.abort();
      expect(controller.signal.aborted).toBe(true);
    });

    it("detects abort reason or AbortError correctly", () => {
      const error = new Error("This operation was aborted");
      error.name = "AbortError";

      const isAborted =
        error.name === "AbortError" || error.message.includes("aborted");
      expect(isAborted).toBe(true);
    });
  });
});
