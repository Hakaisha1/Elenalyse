import { describe, it, expect } from "vitest";
import { trimMemory, MEMORY_LIMITS, MemoryMode } from "../src/chat.js";

const createMessages = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Message ${i + 1}`,
  }));

describe("MEMORY_LIMITS", () => {
  it("defines the expected limits for all modes", () => {
    expect(MEMORY_LIMITS).toEqual({
      amnesia: 10,
      default: 40,
      focus: 100,
    });
    expect(MEMORY_LIMITS.amnesia).toBe(10);
    expect(MEMORY_LIMITS.default).toBe(40);
    expect(MEMORY_LIMITS.focus).toBe(100);
  });
});

describe("trimMemory - Default Mode (limit: 40)", () => {
  it("trims memory exceeding 40 messages when mode is 'default'", () => {
    const memory = createMessages(60);
    const trimmed = trimMemory(memory, "default");
    expect(trimmed.length).toBe(40);
  });

  it("trims memory exceeding 40 messages when mode parameter is omitted", () => {
    const memory = createMessages(50);
    const trimmed = trimMemory(memory);
    expect(trimmed.length).toBe(40);
  });

  it("does not trim when message count equals 40", () => {
    const memory = createMessages(40);
    const trimmed = trimMemory(memory, "default");
    expect(trimmed.length).toBe(40);
    expect(trimmed).toEqual(memory);
  });
});

describe("trimMemory - Amnesia Mode (limit: 10)", () => {
  it("trims memory exceeding 10 messages to exactly 10 in amnesia mode", () => {
    const memory = createMessages(25);
    const trimmed = trimMemory(memory, "amnesia");
    expect(trimmed.length).toBe(10);
  });

  it("does not trim when message count equals 10", () => {
    const memory = createMessages(10);
    const trimmed = trimMemory(memory, "amnesia");
    expect(trimmed.length).toBe(10);
    expect(trimmed).toEqual(memory);
  });

  it("trims to 10 even when memory is large (e.g. 100 messages)", () => {
    const memory = createMessages(100);
    const trimmed = trimMemory(memory, "amnesia");
    expect(trimmed.length).toBe(10);
  });
});

describe("trimMemory - Focus Mode (limit: 100)", () => {
  it("trims memory exceeding 100 messages to exactly 100 in focus mode", () => {
    const memory = createMessages(150);
    const trimmed = trimMemory(memory, "focus");
    expect(trimmed.length).toBe(100);
  });

  it("retains up to 100 messages without trimming", () => {
    const memory = createMessages(100);
    const trimmed = trimMemory(memory, "focus");
    expect(trimmed.length).toBe(100);
    expect(trimmed).toEqual(memory);
  });

  it("allows 80 messages without trimming under focus mode where default would trim", () => {
    const memory = createMessages(80);
    const trimmed = trimMemory(memory, "focus");
    expect(trimmed.length).toBe(80);
  });
});

describe("trimMemory - Edge Cases & Preservation of Newest Messages", () => {
  it("returns an empty array when memory is empty", () => {
    const memory: any[] = [];
    expect(trimMemory(memory, "default")).toEqual([]);
    expect(trimMemory(memory, "amnesia")).toEqual([]);
    expect(trimMemory(memory, "focus")).toEqual([]);
  });

  it("returns the exact same array when memory length is below the limit", () => {
    const smallMemory = createMessages(5);
    expect(trimMemory(smallMemory, "default").length).toBe(5);
    expect(trimMemory(smallMemory, "amnesia").length).toBe(5);
    expect(trimMemory(smallMemory, "focus").length).toBe(5);
    expect(trimMemory(smallMemory, "default")).toEqual(smallMemory);
  });

  it("preserves newest messages while dropping oldest messages in default mode", () => {
    const memory = createMessages(50); // Message 1 to Message 50
    const trimmed = trimMemory(memory, "default"); // Should keep Message 11 to Message 50 (40 items)

    expect(trimmed.length).toBe(40);
    expect(trimmed[0].content).toBe("Message 11");
    expect(trimmed[trimmed.length - 1].content).toBe("Message 50");
  });

  it("preserves newest messages while dropping oldest messages in amnesia mode", () => {
    const memory = createMessages(15); // Message 1 to Message 15
    const trimmed = trimMemory(memory, "amnesia"); // Should keep Message 6 to Message 15 (10 items)

    expect(trimmed.length).toBe(10);
    expect(trimmed[0].content).toBe("Message 6");
    expect(trimmed[trimmed.length - 1].content).toBe("Message 15");
  });

  it("preserves newest messages while dropping oldest messages in focus mode", () => {
    const memory = createMessages(105); // Message 1 to Message 105
    const trimmed = trimMemory(memory, "focus"); // Should keep Message 6 to Message 105 (100 items)

    expect(trimmed.length).toBe(100);
    expect(trimmed[0].content).toBe("Message 6");
    expect(trimmed[trimmed.length - 1].content).toBe("Message 105");
  });

  it("falls back to default mode when an unknown mode is provided", () => {
    const memory = createMessages(50);
    const trimmed = trimMemory(memory, "invalid-mode" as any);
    expect(trimmed.length).toBe(40);
  });
});
