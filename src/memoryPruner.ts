import { extractTextToolCalls } from "./toolParser.js";

/**
 * Smart Memory Compression & Tool Result Pruner
 */

export function isToolResultMessage(m: any): boolean {
  if (!m) return false;
  if (m.role === "tool" || m.role === "tool-result") return true;

  if (typeof m.content === "string") {
    const trimmed = m.content.trim();
    if (trimmed.startsWith("[System Tool Result") || trimmed.startsWith("[Previous Tool Result")) {
      return true;
    }
  }

  if (Array.isArray(m.content)) {
    if (m.content.some((p: any) => p.type === "tool-result" || p.type === "tool_result")) {
      return true;
    }
  }

  return false;
}

export function pruneMemoryToolResults(
  messages: any[],
  retainRecentTurns: number = 2
): any[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // 1. Identify genuine conversational user turns (excluding tool-result injections)
  const userTurnIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "user" && !isToolResultMessage(m)) {
      userTurnIndices.push(i);
    }
  }

  // Determine cutoff index: messages at or after cutoff are retained uncompressed
  let cutoffIndex = 0;
  if (userTurnIndices.length > retainRecentTurns) {
    cutoffIndex = userTurnIndices[userTurnIndices.length - retainRecentTurns];
  } else {
    // All turns are recent, no pruning needed
    cutoffIndex = 0;
  }

  // 2. Clone and prune messages older than cutoffIndex
  return messages.map((msg, index) => {
    // If within recent turns, retain message exactly as-is
    if (index >= cutoffIndex) {
      return { ...msg };
    }

    // Conversational messages are kept intact
    if (!isToolResultMessage(msg)) {
      return { ...msg };
    }

    // Inspect previous message for tool call arguments (e.g. filePath, query)
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const prevToolArgsMap = extractToolArgsFromMessage(prevMsg);

    // Native tool role
    if (msg.role === "tool" || msg.role === "tool-result") {
      return pruneNativeToolMessage(msg, prevToolArgsMap);
    }

    // Text-based tool result (role: "user" containing "[System Tool Result for ...]")
    if (typeof msg.content === "string") {
      const prunedContent = pruneTextToolResults(msg.content, prevToolArgsMap);
      return {
        ...msg,
        content: prunedContent,
      };
    }

    return { ...msg };
  });
}

function extractToolArgsFromMessage(msg: any): Map<string, string> {
  const map = new Map<string, string>();
  if (!msg) return map;

  // AI SDK native toolCalls
  if (Array.isArray(msg.toolCalls)) {
    for (const tc of msg.toolCalls) {
      const name = tc.toolName || tc.name;
      const args = tc.args || {};
      const target = args.filePath || args.path || args.file || args.filename || args.query || args.dirPath || "";
      if (name && target) {
        map.set(name.toLowerCase(), target);
      }
    }
  }

  // AI SDK content parts
  if (Array.isArray(msg.content)) {
    for (const p of msg.content) {
      if (p.type === "tool-call" || p.type === "tool_call") {
        const name = p.toolName || p.name;
        const args = p.args || {};
        const target = args.filePath || args.path || args.file || args.filename || args.query || args.dirPath || "";
        if (name && target) {
          map.set(name.toLowerCase(), target);
        }
      }
    }
  }

  // Text-based tool calls (XML / JSON blocks)
  if (typeof msg.content === "string") {
    const { toolCalls } = extractTextToolCalls(msg.content);
    for (const tc of toolCalls) {
      const name = tc.toolName;
      const args = tc.args || {};
      const target = args.filePath || args.path || args.file || args.filename || args.query || args.dirPath || "";
      if (name && target) {
        map.set(name.toLowerCase(), target);
      }
    }
  }

  return map;
}

function pruneNativeToolMessage(msg: any, prevToolArgsMap: Map<string, string>): any {
  const toolName = msg.toolName || msg.name || "tool";
  const target =
    msg.filePath ||
    msg.path ||
    msg.query ||
    prevToolArgsMap.get(toolName.toLowerCase()) ||
    "";

  if (typeof msg.result === "string") {
    if (msg.result.length > 200) {
      const lineCount = msg.result.split("\n").length;
      return {
        ...msg,
        result: `[Previous Tool Result: ${toolName}(${target}) - ${lineCount} lines inspected in prior turn]`,
      };
    }
    return { ...msg };
  }

  if (typeof msg.content === "string") {
    if (msg.content.length > 200) {
      const lineCount = msg.content.split("\n").length;
      return {
        ...msg,
        content: `[Previous Tool Result: ${toolName}(${target}) - ${lineCount} lines inspected in prior turn]`,
      };
    }
    return { ...msg };
  }

  if (Array.isArray(msg.content)) {
    const newContent = msg.content.map((p: any) => {
      if (p.type === "tool-result" || p.type === "tool_result") {
        const pToolName = p.toolName || toolName;
        const pTarget = p.filePath || target || prevToolArgsMap.get(pToolName.toLowerCase()) || "";
        const rawRes = typeof p.result === "string" ? p.result : JSON.stringify(p.result || "");
        if (rawRes.length > 200) {
          const lineCount = rawRes.split("\n").length;
          return {
            ...p,
            result: `[Previous Tool Result: ${pToolName}(${pTarget}) - ${lineCount} lines inspected in prior turn]`,
          };
        }
      }
      return p;
    });
    return { ...msg, content: newContent };
  }

  return { ...msg };
}

function pruneTextToolResults(
  text: string,
  prevToolArgsMap: Map<string, string>
): string {
  // Regex matches [System Tool Result for "${toolName}" (optional args)]:\n${output}
  const toolBlockRegex = /\[System Tool Result for "([^"]+)"(?:\s*\(([^)]*)\))?\]:\r?\n([\s\S]*?)(?=(?:\r?\n\r?\n\[System Tool Result for|\r?\n\r?\nPlease proceed|$))/g;

  return text.replace(toolBlockRegex, (match, toolName, rawArgs, output) => {
    // If output is small (<= 200 chars), preserve original result
    if (output.trim().length <= 200) {
      return match;
    }

    const lineCount = output.trim().split("\n").length;
    const target =
      rawArgs ||
      prevToolArgsMap.get(toolName.toLowerCase()) ||
      "";

    return `[Previous Tool Result: ${toolName}(${target}) - ${lineCount} lines inspected in prior turn]`;
  });
}
