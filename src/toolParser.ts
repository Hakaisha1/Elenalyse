export interface ParsedToolCall {
  id: string;
  toolName: string;
  args: Record<string, any>;
}

const KNOWN_TOOLS: Record<string, string> = {
  listdir: "listDir",
  readfile: "readFile",
  searchcode: "searchCode",
  findfiles: "findFiles",
  gitstatus: "gitStatus",
  gitdiff: "gitDiff",
  writefile: "writeFile",
  editfile: "editFile",
  runcommand: "runCommand",
};

export function canonicalToolName(rawName: string): string {
  const clean = rawName.trim().replace(/^["']|["']$/g, "");
  return KNOWN_TOOLS[clean.toLowerCase()] || clean;
}

export function normalizeToolArgs(
  toolName: string,
  rawArgs: Record<string, any>
): Record<string, any> {
  const args = { ...rawArgs };
  const lowerName = toolName.toLowerCase();

  // Normalize path
  if (args.path !== undefined) {
    if (lowerName === "listdir") {
      args.dirPath = args.path;
    } else {
      args.filePath = args.path;
    }
    delete args.path;
  }

  if (args.file !== undefined && args.filePath === undefined) {
    args.filePath = args.file;
    delete args.file;
  }
  if (args.filename !== undefined && args.filePath === undefined) {
    args.filePath = args.filename;
    delete args.filename;
  }
  if (args.dir !== undefined && args.dirPath === undefined) {
    args.dirPath = args.dir;
    delete args.dir;
  }
  if (args.directory !== undefined && args.dirPath === undefined) {
    args.dirPath = args.directory;
    delete args.directory;
  }
  if (lowerName === "writefile") {
    if (args.code !== undefined && args.content === undefined) {
      args.content = args.code;
      delete args.code;
    }
    if (args.text !== undefined && args.content === undefined) {
      args.content = args.text;
      delete args.text;
    }
  }
  if (lowerName === "editfile") {
    if (args.search !== undefined && args.targetText === undefined) {
      args.targetText = args.search;
      delete args.search;
    }
    if (args.oldtext !== undefined && args.targetText === undefined) {
      args.targetText = args.oldtext;
      delete args.oldtext;
    }
    if (args.oldText !== undefined && args.targetText === undefined) {
      args.targetText = args.oldText;
      delete args.oldText;
    }
    if (args.replace !== undefined && args.replacementText === undefined) {
      args.replacementText = args.replace;
      delete args.replace;
    }
    if (args.newtext !== undefined && args.replacementText === undefined) {
      args.replacementText = args.newtext;
      delete args.newtext;
    }
    if (args.newText !== undefined && args.replacementText === undefined) {
      args.replacementText = args.newText;
      delete args.newText;
    }
  }

  return args;
}

export function extractTextToolCalls(text: string): {
  cleanedText: string;
  toolCalls: ParsedToolCall[];
} {
  if (!text) return { cleanedText: "", toolCalls: [] };

  const toolCalls: ParsedToolCall[] = [];
  let callIndex = 1;

  // 1. Check for <tool_call>...</tool_call> tags
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let match: RegExpExecArray | null;

  while ((match = toolCallRegex.exec(text)) !== null) {
    const block = match[1].trim();

    // Check if block contains JSON: {"name": "...", "arguments": { ... }}
    const jsonMatch = block.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const rawTool =
          parsed.name || parsed.function || parsed.tool || parsed.toolName;
        if (rawTool) {
          const toolName = canonicalToolName(rawTool);
          const rawArgs =
            parsed.arguments ||
            parsed.parameters ||
            parsed.args ||
            parsed.params ||
            {};
          toolCalls.push({
            id: `call_${Date.now()}_${callIndex++}`,
            toolName,
            args: normalizeToolArgs(toolName, rawArgs),
          });
          continue;
        }
      } catch {}
    }

    // Check if block contains XML: <function=toolName> or <function name="toolName">
    const funcMatch = block.match(
      /<function(?:=|\s+name=)([^>]+)>([\s\S]*?)<\/function>/i
    );
    if (funcMatch) {
      const rawTool = funcMatch[1].trim().replace(/^["']|["']$/g, "");
      const toolName = canonicalToolName(rawTool);
      const funcBody = funcMatch[2];

      const rawArgs: Record<string, any> = {};
      const paramRegex =
        /<parameter(?:=|\s+name=)([^>]+)>([\s\S]*?)<\/parameter>/gi;
      let pMatch: RegExpExecArray | null;
      while ((pMatch = paramRegex.exec(funcBody)) !== null) {
        const key = pMatch[1].trim().replace(/^["']|["']$/g, "");
        const val = pMatch[2].trim();
        rawArgs[key] = val;
      }

      toolCalls.push({
        id: `call_${Date.now()}_${callIndex++}`,
        toolName,
        args: normalizeToolArgs(toolName, rawArgs),
      });
      continue;
    }
  }

  // 2. Check for standalone <function=...> without <tool_call> wrapper
  if (toolCalls.length === 0) {
    const standaloneFuncRegex =
      /<function(?:=|\s+name=)([^>]+)>([\s\S]*?)<\/function>/gi;
    while ((match = standaloneFuncRegex.exec(text)) !== null) {
      const rawTool = match[1].trim().replace(/^["']|["']$/g, "");
      const toolName = canonicalToolName(rawTool);
      const funcBody = match[2];

      const rawArgs: Record<string, any> = {};
      const paramRegex =
        /<parameter(?:=|\s+name=)([^>]+)>([\s\S]*?)<\/parameter>/gi;
      let pMatch: RegExpExecArray | null;
      while ((pMatch = paramRegex.exec(funcBody)) !== null) {
        const key = pMatch[1].trim().replace(/^["']|["']$/g, "");
        const val = pMatch[2].trim();
        rawArgs[key] = val;
      }

      toolCalls.push({
        id: `call_${Date.now()}_${callIndex++}`,
        toolName,
        args: normalizeToolArgs(toolName, rawArgs),
      });
    }
  }

  // 3. Check for markdown json code block: ```json\n{"tool": "...", "args": ...}\n```
  if (toolCalls.length === 0) {
    const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```/gi;
    while ((match = jsonBlockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        const rawTool =
          parsed.tool || parsed.name || parsed.function || parsed.toolName;
        if (
          rawTool &&
          (parsed.args !== undefined ||
            parsed.arguments !== undefined ||
            parsed.parameters !== undefined)
        ) {
          const toolName = canonicalToolName(rawTool);
          const rawArgs =
            parsed.args || parsed.arguments || parsed.parameters || {};
          toolCalls.push({
            id: `call_${Date.now()}_${callIndex++}`,
            toolName,
            args: normalizeToolArgs(toolName, rawArgs),
          });
        }
      } catch {}
    }
  }

  const cleanedText = stripToolCallTags(text);
  return { cleanedText, toolCalls };
}

export function stripToolCallTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<function(?:=[^>]+|\s+name=[^>]+)>[\s\S]*?<\/function>/gi, "")
    .replace(/```json\s*\{\s*"(?:tool|function|name)"[\s\S]*?\}\s*```/gi, "")
    .replace(/<\/?(?:tool_call|function|parameter)[^>]*>/gi, "")
    .trim();
}
