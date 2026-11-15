import chalk from "chalk";

/**
 * Terminal Markdown & Code Syntax Highlighting Engine
 */

const KEYWORDS_TS = new Set([
  "const", "let", "var", "function", "return", "import", "export", "from",
  "async", "await", "class", "interface", "type", "if", "else", "for",
  "while", "switch", "case", "break", "new", "this", "try", "catch",
  "throw", "default", "extends", "implements", "typeof", "instanceof",
  "as", "in", "of", "super", "constructor", "static", "readonly", "enum"
]);

const TYPES_TS = new Set([
  "string", "number", "boolean", "any", "void", "null", "undefined",
  "never", "unknown", "Promise", "Array", "Record", "true", "false",
  "Object", "Function", "Symbol", "BigInt"
]);

const KEYWORDS_PY = new Set([
  "def", "class", "import", "from", "return", "if", "elif", "else",
  "for", "while", "try", "except", "finally", "with", "as", "lambda",
  "yield", "pass", "raise", "in", "is", "not", "and", "or", "async",
  "await", "assert", "global", "nonlocal"
]);

const TYPES_PY = new Set([
  "True", "False", "None", "self", "int", "str", "float", "bool",
  "list", "dict", "set", "tuple", "bytes", "object"
]);

const KEYWORDS_SQL = new Set([
  "select", "from", "where", "insert", "into", "values", "update", "set",
  "delete", "join", "left", "right", "inner", "outer", "on", "group",
  "by", "order", "asc", "desc", "limit", "offset", "create", "table",
  "alter", "drop", "index", "and", "or", "not", "null", "primary",
  "key", "foreign", "references", "having", "union", "distinct", "as"
]);

const KEYWORDS_SH = new Set([
  "npm", "npx", "pnpm", "yarn", "git", "cd", "ls", "mkdir", "rm", "cp",
  "mv", "echo", "cat", "curl", "node", "export", "source", "if", "then",
  "else", "elif", "fi", "for", "do", "done", "case", "esac", "while",
  "sudo", "chmod", "chown", "grep", "find", "sed", "awk"
]);

export function highlightSyntax(code: string, lang: string): string {
  const normalizedLang = lang.trim().toLowerCase();

  // Diff highlighting
  if (normalizedLang === "diff") {
    return code
      .split("\n")
      .map((line) => {
        if (line.startsWith("+")) return chalk.green(line);
        if (line.startsWith("-")) return chalk.red(line);
        if (line.startsWith("@@")) return chalk.cyan(line);
        if (line.startsWith("diff ") || line.startsWith("index ")) return chalk.bold(line);
        return chalk.gray(line);
      })
      .join("\n");
  }

  // Tokenization-based highlighting to avoid replacing keywords inside strings or comments
  const lines = code.split("\n");
  return lines
    .map((line) => highlightLine(line, normalizedLang))
    .join("\n");
}

function highlightLine(line: string, lang: string): string {
  if (!line.trim()) return line;

  const tokens: { placeholder: string; text: string; color: (s: string) => string }[] = [];
  let tokenCounter = 0;

  const addToken = (text: string, color: (s: string) => string): string => {
    const ph = `\u0001TOKEN_${tokenCounter++}\u0001`;
    tokens.push({ placeholder: ph, text, color });
    return ph;
  };

  let working = line;

  // 1. Comments
  if (lang === "python" || lang === "py" || lang === "bash" || lang === "sh") {
    working = working.replace(/(#.*)$/, (match) => addToken(match, chalk.gray));
  } else if (lang === "sql") {
    working = working.replace(/(--.*)$/, (match) => addToken(match, chalk.gray));
  } else {
    // JS / TS / C / JSON comments
    working = working.replace(/(\/\/.*)$/, (match) => addToken(match, chalk.gray));
  }

  // 2. Strings (Double quote, single quote, template literals)
  working = working.replace(/(["'`])(?:\\.|[^\\])*?\1/g, (match) =>
    addToken(match, chalk.greenBright)
  );

  // 3. Language-specific word tokens
  if (lang === "typescript" || lang === "ts" || lang === "javascript" || lang === "js" || lang === "json") {
    working = working.replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, (word) => {
      if (KEYWORDS_TS.has(word)) return chalk.magentaBright(word);
      if (TYPES_TS.has(word)) return chalk.yellowBright(word);
      return word;
    });
  } else if (lang === "python" || lang === "py") {
    working = working.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, (word) => {
      if (KEYWORDS_PY.has(word)) return chalk.magentaBright(word);
      if (TYPES_PY.has(word)) return chalk.yellowBright(word);
      return word;
    });
  } else if (lang === "sql") {
    working = working.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, (word) => {
      if (KEYWORDS_SQL.has(word.toLowerCase())) return chalk.magentaBright(word.toUpperCase());
      return word;
    });
  } else if (lang === "bash" || lang === "sh") {
    working = working.replace(/\b[a-zA-Z_-][a-zA-Z0-9_-]*\b/g, (word) => {
      if (KEYWORDS_SH.has(word)) return chalk.magentaBright(word);
      return word;
    });
  }

  // 4. Numbers
  working = working.replace(/\b\d+(?:\.\d+)?\b/g, (match) => chalk.cyan(match));

  // 5. Restore tokens
  for (const t of tokens) {
    working = working.replace(t.placeholder, t.color(t.text));
  }

  return working;
}

export function renderCodeBlock(code: string, lang: string): string {
  const displayLang = lang.trim() || "code";
  const highlighted = highlightSyntax(code, displayLang);
  const lines = highlighted.split("\n");

  const headerTitle = `[${displayLang}]`;
  const topBorder = chalk.gray(`┌─ `) + chalk.cyan(headerTitle) + " " + chalk.gray("─".repeat(Math.max(10, 52 - headerTitle.length)));
  const bottomBorder = chalk.gray("└" + "─".repeat(56));

  const contentLines = lines.map((l) => chalk.gray("│ ") + l);

  return [topBorder, ...contentLines, bottomBorder].join("\n");
}

export function renderMarkdown(text: string, persona?: string): string {
  if (!text) return "";

  // Defensively strip any lingering voice tags before rendering
  const cleanedText = text
    .replace(/<voice(?:\s+[^>]*?)?>[\s\S]*?<\/voice>/gi, "")
    .replace(/<voice(?:\s+[^>]*?)?>[\s\S]*$/gi, "")
    .replace(/<\/?voice(?:\s+[^>]*?)?\/?>/gi, "")
    .replace(/\n{3,}/g, "\n\n");

  // Step 1: Extract fenced code blocks to prevent markdown parsing inside them
  const codeBlocks: { placeholder: string; rendered: string }[] = [];
  let blockIndex = 0;

  let processed = cleanedText.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_match, lang, code) => {
    const ph = `\u0002CODEBLOCK_${blockIndex++}\u0002`;
    codeBlocks.push({
      placeholder: ph,
      rendered: renderCodeBlock(code.trimEnd(), lang || "text"),
    });
    return ph;
  });

  // Color mapping for persona accents
  const personaColor = getPersonaColor(persona);

  // Step 2: Line-by-line markdown rendering
  const lines = processed.split("\n");
  const renderedLines = lines.map((line) => {
    // Fenced code block placeholder check
    if (line.includes("\u0002CODEBLOCK_")) {
      return line;
    }

    // Headers
    const h1Match = line.match(/^#[ \t]+(.*)$/);
    if (h1Match) {
      const title = h1Match[1].trim();
      return (
        "\n" +
        personaColor.bold(`■ ${title}`) +
        "\n" +
        chalk.gray("─".repeat(Math.min(60, title.length + 4)))
      );
    }

    const h2Match = line.match(/^##[ \t]+(.*)$/);
    if (h2Match) {
      const title = h2Match[1].trim();
      return "\n" + personaColor.bold(`◆ ${title}`);
    }

    const h3Match = line.match(/^###[ \t]+(.*)$/);
    if (h3Match) {
      const title = h3Match[1].trim();
      return personaColor.bold(`▸ ${title}`);
    }

    // Bullet points
    const bulletMatch = line.match(/^([ \t]*)[-*+][ \t]+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1];
      const content = renderInlineFormatting(bulletMatch[2]);
      return `${indent}${chalk.cyan("•")} ${content}`;
    }

    // Numbered lists
    const numMatch = line.match(/^([ \t]*)(\d+\.)[ \t]+(.*)$/);
    if (numMatch) {
      const indent = numMatch[1];
      const num = numMatch[2];
      const content = renderInlineFormatting(numMatch[3]);
      return `${indent}${chalk.cyan(num)} ${content}`;
    }

    // Blockquotes
    const quoteMatch = line.match(/^([ \t]*)>[ \t]+(.*)$/);
    if (quoteMatch) {
      const indent = quoteMatch[1];
      const content = renderInlineFormatting(quoteMatch[2]);
      return `${indent}${chalk.gray("│")} ${chalk.dim(content)}`;
    }

    // General inline formatting
    return renderInlineFormatting(line);
  });

  let result = renderedLines.join("\n");

  // Step 3: Restore code blocks
  for (const cb of codeBlocks) {
    result = result.replace(cb.placeholder, cb.rendered);
  }

  return result;
}

function renderInlineFormatting(line: string): string {
  // Inline code `code`
  let res = line.replace(/`([^`]+)`/g, (_m, code) => chalk.cyan.bold(`\`${code}\``));

  // Bold **text** or __text__
  res = res.replace(/\*\*([^*]+)\*\*/g, (_m, text) => chalk.bold(text));
  res = res.replace(/__([^_]+)__/g, (_m, text) => chalk.bold(text));

  // Italic *text* or _text_
  res = res.replace(/\*([^*]+)\*/g, (_m, text) => chalk.italic(text));
  res = res.replace(/_([^_]+)_/g, (_m, text) => chalk.italic(text));

  return res;
}

function getPersonaColor(persona?: string): typeof chalk {
  const p = persona?.toLowerCase();
  if (p === "rei") return chalk.magenta;
  if (p === "sora") return chalk.blue;
  if (p === "rin") return chalk.yellow;
  return chalk.cyan; // eli / default
}
