import { generateText } from "ai";
import * as readline from "readline/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import os from "os";
import path from "path";
import sound from "sound-play";
import { getConfig, setConfig, isFailoverError, executeWithFailover, Provider } from "./config.js";
export { isFailoverError, executeWithFailover };
import { getPersonaPrompt, getPersonaColor, PERSONA_SPEAKER_MAP } from "./personas.js";
import { readFileTool, listDirTool, gitStatusTool, gitDiffTool, searchCodeTool, findFilesTool, createRunCommandTool, createWriteFileTool, createEditFileTool } from "./tools.js";
import { ensureEngineDownloaded, ensureEngineRunning } from "./voiceEngine.js";
import { synthesizeSpeech } from "./tts.js";
import { undoLastChange } from "./undo.js";
import { saveSession, loadSession, listSessions } from "./session.js";
import { renderWelcomeBanner, printWelcomeBanner } from "./ui/banner.js";
import { interactivePrompt } from "./ui/prompt.js";
export { renderWelcomeBanner, printWelcomeBanner, interactivePrompt };
import { extractTextToolCalls, stripToolCallTags, canonicalToolName, normalizeToolArgs, ParsedToolCall } from "./toolParser.js";
export { extractTextToolCalls, stripToolCallTags, canonicalToolName, normalizeToolArgs, ParsedToolCall };

export const MAX_AUTONOMOUS_STEPS = 15;

export function formatToolArgs(args: Record<string, any>): string {
  if (!args || Object.keys(args).length === 0) return "";
  return Object.entries(args)
    .map(([k, v]) => {
      let strVal = typeof v === "string" ? v : JSON.stringify(v);
      if (strVal && strVal.length > 25) {
        strVal = strVal.slice(0, 22) + "...";
      }
      return `${k}=${strVal}`;
    })
    .join(", ");
}

export async function executeToolDirectly(
  toolName: string,
  rawArgs: Record<string, any>,
  toolsMap: Record<string, any>
): Promise<string> {
  const canonical = canonicalToolName(toolName);
  const normalizedArgs = normalizeToolArgs(canonical, rawArgs || {});
  const toolInstance = toolsMap[canonical];
  if (!toolInstance || typeof toolInstance.execute !== "function") {
    return `Error: Unknown or unsupported tool '${toolName}'.`;
  }
  try {
    const result = await toolInstance.execute(normalizedArgs);
    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  } catch (err: any) {
    return `Error executing ${canonical}: ${err?.message || String(err)}`;
  }
}
import {
  startBridgeServer,
  stopBridgeServer,
  broadcastSpeakEvent,
  broadcastPersonaEvent,
  hasConnectedClients,
  VoiceEventPayload,
} from "./bridge.js";

export interface VoiceSegment {
  text: string;
  emotion?: string;
}

function extractVoiceSegments(responseText: string, debug: boolean = false): { displayText: string; voiceLines: VoiceSegment[] } {
  if (!responseText) return { displayText: "", voiceLines: [] };
  const voiceLines: VoiceSegment[] = [];
  
  // Match <voice> or <voice emotion="sad">
  const displayText = responseText.replace(/<voice(?:\s+emotion="([^"]+)")?>([\s\S]*?)<\/voice>/g, (_, emotion, content) => {
    voiceLines.push({ text: content.trim(), emotion });
    return debug ? chalk.magenta(`\n[VOICE${emotion ? ` (${emotion})` : ''}: ${content.trim()}]\n`) : "";
  });
  return { displayText: displayText.trim(), voiceLines };
}

function stripVoiceTags(text: string): string {
  return text.replace(/<voice(?:\s+emotion="([^"]+)")?>[\s\S]*?<\/voice>/g, "").trim();
}

function sanitizeForMemory(messages: any[]): any[] {
  return messages.map((m: any) => {
    if (m.role === "assistant") {
      let content: string = "";
      if (Array.isArray(m.content)) {
        content = m.content
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
        if (!content) {
          const toolCalls = m.content.filter((p: any) => p.type === "tool-call");
          if (toolCalls.length > 0) {
            content = `[Executed tool: ${toolCalls.map((t: any) => t.toolName).join(", ")}]`;
          }
        }
      } else {
        content = String(m.content || "");
      }
      return { role: "assistant", content: stripVoiceTags(content) };
    }
    // For tool-call and tool-result messages, keep role + content only
    return { role: m.role, content: m.content };
  });
}

async function playVoiceLines(voiceLines: VoiceSegment[], speakerId: number) {
  const { activePersona } = getConfig();

  for (let i = 0; i < voiceLines.length; i++) {
    try {
      const { audio, cues, totalDuration } = await synthesizeSpeech(voiceLines[i].text, speakerId, voiceLines[i].emotion);

      if (hasConnectedClients()) {
        const payload: VoiceEventPayload = {
          id: `voice_${Date.now()}_${i}`,
          persona: activePersona,
          emotion: voiceLines[i].emotion,
          text: voiceLines[i].text,
          audioBase64: audio.toString("base64"),
          cues,
          totalDuration,
        };
        broadcastSpeakEvent(payload);
        // Beri jeda durasi audio agar segmen berikutnya tidak bertabrakan
        await new Promise((resolve) => setTimeout(resolve, totalDuration * 1000 + 120));
      } else {
        const tempPath = path.join(os.tmpdir(), `elenalyse_voice_${Date.now()}_${i}.wav`);
        fs.writeFileSync(tempPath, audio);
        await sound.play(tempPath);
        fs.unlinkSync(tempPath);
      }
    } catch (e: any) {
      console.log(chalk.red(`\n[TTS Error: ${e.message}]`));
    }
  }
}

export async function handleChat(message: string, voiceEnabled: boolean, debug: boolean = false) {
  if (!message) {
    console.log(chalk.red("Error: Message is required."));
    process.exit(1);
  }

  const { activePersona, provider, model } = getConfig();
  const systemPrompt = await getPersonaPrompt(activePersona, voiceEnabled);
  const colorName = getPersonaColor(activePersona) as keyof typeof chalk;
  
  const colorFn = (chalk as any)[colorName] || chalk.white;
  
  const spinner = ora(`Elenalyse (${activePersona.toUpperCase()}) is thinking...`).start();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let runProvider = provider;
  let runModel = model;
  let hasAttemptedFallback = false;

  try {
    const config = getConfig();

    while (true) {
      try {
        const aiClientFactory = await getAiClient(runProvider, runModel, config);

        const toolsMap = {
          readFile: readFileTool,
          listDir: listDirTool,
          gitStatus: gitStatusTool,
          gitDiff: gitDiffTool,
          searchCode: searchCodeTool,
          findFiles: findFilesTool,
          writeFile: createWriteFileTool(
            () => spinner.stop(),
            () => spinner.start(),
            rl
          ),
          editFile: createEditFileTool(
            () => spinner.stop(),
            () => spinner.start(),
            rl
          ),
          runCommand: createRunCommandTool(
            () => spinner.stop(),
            () => spinner.start(),
            rl
          )
        };

        const currentMessages: any[] = [{ role: "user", content: message }];
        let previousToolCallsStr = "";
        let finalText = "";
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        for (let step = 1; step <= MAX_AUTONOMOUS_STEPS; step++) {
          const genResult = await generateText({
            model: aiClientFactory,
            system: systemPrompt,
            messages: currentMessages,
            tools: toolsMap,
            // @ts-ignore
            maxSteps: 1,
          });

          if (genResult.usage) {
            totalPromptTokens += (genResult.usage as any).promptTokens || 0;
            totalCompletionTokens += (genResult.usage as any).completionTokens || 0;
          }

          // 1. Check native tool calls
          if (genResult.toolCalls && genResult.toolCalls.length > 0) {
            const tc = genResult.toolCalls[0];
            const argsSummary = formatToolArgs((tc as any).args || {});
            spinner.text = `${colorFn("⚡")} ${activePersona.toUpperCase()} is analyzing: calling ${tc.toolName}(${argsSummary}) [Step ${step}/${MAX_AUTONOMOUS_STEPS}]...`;

            if (genResult.response && genResult.response.messages) {
              currentMessages.push(...genResult.response.messages);
            } else {
              currentMessages.push({
                role: "assistant",
                content: genResult.text || `[Calling tool ${tc.toolName}]`,
              });
            }
            continue;
          }

          // 2. Check text-based XML or JSON tool calls
          const { toolCalls: textToolCalls } = extractTextToolCalls(genResult.text || "");
          if (textToolCalls.length > 0) {
            let loopDetected = false;
            let combinedToolOutputs = "";

            for (const tc of textToolCalls) {
              const toolCallSig = `${tc.toolName}:${JSON.stringify(tc.args)}`;
              if (toolCallSig === previousToolCallsStr) {
                spinner.warn(chalk.yellow(`Agent loop detected: repeated identical tool call ${tc.toolName}.`));
                loopDetected = true;
                break;
              }
              previousToolCallsStr = toolCallSig;

              const argsSummary = formatToolArgs(tc.args);
              spinner.text = `${colorFn("⚡")} ${activePersona.toUpperCase()} is analyzing: calling ${tc.toolName}(${argsSummary}) [Step ${step}/${MAX_AUTONOMOUS_STEPS}]...`;

              const toolOutput = await executeToolDirectly(tc.toolName, tc.args, toolsMap);
              combinedToolOutputs += `[System Tool Result for "${tc.toolName}"]:\n${toolOutput}\n\n`;
            }

            if (loopDetected) {
              finalText = stripToolCallTags(genResult.text || "");
              break;
            }

            currentMessages.push({
              role: "assistant",
              content: genResult.text,
            });
            currentMessages.push({
              role: "user",
              content: `${combinedToolOutputs.trim()}\n\nPlease proceed with your analysis or provide your final report.`,
            });
            continue;
          }

          // 3. No tool calls - this is the final report
          finalText = stripToolCallTags(genResult.text || "");
          break;
        }

        spinner.stop();

        if (!finalText && currentMessages.length > 1) {
          const finalSummaryRun = await generateText({
            model: aiClientFactory,
            system: systemPrompt,
            messages: [
              ...currentMessages,
              {
                role: "user",
                content: "[System: Max analysis steps reached. Please provide your final comprehensive summary based on all findings so far.]",
              },
            ],
          });
          finalText = stripToolCallTags(finalSummaryRun.text || "");
          if (finalSummaryRun.usage) {
            totalPromptTokens += (finalSummaryRun.usage as any).promptTokens || 0;
            totalCompletionTokens += (finalSummaryRun.usage as any).completionTokens || 0;
          }
        }

        console.log(colorFn(`Elenalyse (${activePersona.toUpperCase()}): `) + finalText);
        console.log(chalk.gray(`\n[Token Usage: ${totalPromptTokens} input / ${totalCompletionTokens} output]`));

        if (voiceEnabled) {
          await startBridgeServer();
          let { displayText, voiceLines } = extractVoiceSegments(finalText, debug);
          if (voiceLines.length > 0) {
            const speakerId = PERSONA_SPEAKER_MAP[activePersona] || 2;
            await playVoiceLines(voiceLines, speakerId);
          }
        }
        break; // Successfully finished
      } catch (innerError: any) {
        if (!hasAttemptedFallback && config.fallbackProvider && config.fallbackProvider !== runProvider && isFailoverError(innerError)) {
          hasAttemptedFallback = true;
          spinner.stop();
          console.log(chalk.yellow(`\n[Notice: Switched to fallback provider ${config.fallbackProvider} due to error]`));
          runProvider = config.fallbackProvider;
          runModel = config.fallbackModel || model;
          spinner.start(`Elenalyse (${activePersona.toUpperCase()}) is retrying with ${runProvider}...`);
          continue;
        }
        throw innerError;
      }
    }
  } catch (error: any) {
    spinner.fail("Failed to get response from AI engine.");
    console.error(chalk.red(error.message));
  } finally {
    if (voiceEnabled) {
      stopBridgeServer();
    }
    rl.close();
  }
}

async function getAiClient(provider: string, model: string, config: any) {
  const getApiKey = (envKeys: string[], configKey: string) => {
    for (const key of envKeys) {
      if (process.env[key]) return process.env[key];
    }
    if (config.apiKeys && config.apiKeys[configKey]) {
      return config.apiKeys[configKey];
    }
    return undefined;
  };

  if (provider === "openrouter") {
    const apiKey = getApiKey(["OPENROUTER_API_KEY", "OPENAI_API_KEY"], "openrouter");
    if (!apiKey) throw new Error("API KEY for OpenRouter is not set. Use /api openrouter <key> to set it.");
    return createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey })(model);
  } else if (provider === "openai") {
    const apiKey = getApiKey(["OPENAI_API_KEY"], "openai");
    if (!apiKey) throw new Error("API KEY for OpenAI is not set. Use /api openai <key> to set it.");
    return createOpenAI({ apiKey })(model);
  } else if (provider === "local") {
    return createOpenAI({ baseURL: "http://localhost:11434/v1", apiKey: "local" })(model);
  } else if (provider === "google") {
    const apiKey = getApiKey(["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"], "google");
    if (!apiKey) throw new Error("API KEY for Google is not set. Use /api google <key> to set it.");
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  throw new Error(`Unknown AI provider configured: ${provider}`);
}

// --- Handoff Helpers ---
interface SessionState {
  filesTouched: Set<string>;
}

function getRecentContext(history: any[], maxChars: number = 1000): any[] {
  const result: any[] = [];
  let charCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msgLen = typeof history[i].content === "string" ? history[i].content.length : 100;
    charCount += msgLen;
    if (charCount > maxChars) break;
    result.unshift(history[i]);
  }
  return result;
}

function buildHandoffNote(fromPersona: string, history: any[], state: SessionState): string {
  const lastUserMsg = [...history].reverse().find(m => m.role === "user");
  const filesLine = state.filesTouched.size > 0
    ? `Files touched this session: ${[...state.filesTouched].join(", ")}`
    : "No files were touched in this session.";
  const recentWindow = getRecentContext(history);
  const recentSummary = recentWindow
    .filter(m => typeof m.content === "string")
    .map(m => `[${m.role}]: ${m.content.length > 200 ? m.content.slice(0, 200) + "..." : m.content}`)
    .join("\n");

  return `[SYSTEM HANDOFF NOTE] You are taking over from ${fromPersona.toUpperCase()}.
${filesLine}
Last user message: "${lastUserMsg?.content?.slice(0, 200) ?? "(none)"}"
Recent conversation context:
${recentSummary}

[CRITICAL INSTRUCTION: You MUST reply in the same language the user was using in the context above (e.g., if the user spoke Indonesian, you must reply in Indonesian). Do not switch to English just because this system note is in English.]`;
}

export function collectPasteLines(lines: string[]): { action: "submit" | "cancel" | "empty"; text?: string } {
  const buffer: string[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.toUpperCase() === "CANCEL") {
      return { action: "cancel" };
    }
    if (trimmed.toUpperCase() === "END") {
      const text = buffer.join("\n").trim();
      return text ? { action: "submit", text } : { action: "empty" };
    }
    buffer.push(rawLine);
  }
  const text = buffer.join("\n").trim();
  return text ? { action: "submit", text } : { action: "empty" };
}

export function popLastTurnForRetry(messages: any[]): { success: boolean; lastUserMessage?: string } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { success: false };
  }
  while (messages.length > 0 && messages[messages.length - 1].role !== "user") {
    messages.pop();
  }
  if (messages.length > 0 && messages[messages.length - 1].role === "user") {
    const userMsg = messages.pop();
    return { success: true, lastUserMessage: typeof userMsg.content === "string" ? userMsg.content : "" };
  }
  return { success: false };
}

export type MemoryMode = "default" | "amnesia" | "focus";

export const MEMORY_LIMITS: Record<MemoryMode, number> = {
  amnesia: 10,
  default: 40,
  focus: 100,
};

export function trimMemory(
  memory: any[],
  modeOrDebug?: MemoryMode | boolean,
  debug: boolean = false
): any[] {
  let mode: MemoryMode = "default";
  let isDebug = debug;

  if (typeof modeOrDebug === "boolean") {
    isDebug = modeOrDebug;
  } else if (modeOrDebug && typeof modeOrDebug === "string") {
    mode = modeOrDebug;
  }

  const limit = MEMORY_LIMITS[mode] ?? MEMORY_LIMITS.default;
  if (!Array.isArray(memory) || memory.length <= limit) return memory;
  const trimCount = memory.length - limit;
  if (isDebug) {
    console.log(chalk.gray(`[DEBUG] Memory trimmed: removed ${trimCount} oldest messages (${memory.length} → ${limit})`));
  }
  // Keep the most recent messages, drop the oldest
  return memory.slice(trimCount);
}

export async function startInteractiveChat(
  voiceEnabled: boolean = false,
  debug: boolean = false,
  memoryMode: MemoryMode = "default"
) {
  let config = getConfig();
  let activePersona = config.activePersona;
  let provider = config.provider;
  let model = config.model;
  
  const showBanner = () => {
    printWelcomeBanner({
      persona: activePersona,
      provider,
      model,
      fallbackProvider: config.fallbackProvider,
      fallbackModel: config.fallbackModel,
      memoryMode,
      voiceEnabled,
    });
  };

  showBanner();

  if (voiceEnabled) {
    await startBridgeServer();
    try {
      // Check if Voicevox is already running (e.g. user manually opened Voicevox Editor)
      const isAlreadyRunning = await fetch("http://127.0.0.1:50021/version")
        .then(res => res.ok)
        .catch(() => false);

      if (!isAlreadyRunning) {
        await ensureEngineDownloaded(msg => console.log(chalk.gray(msg)));
        await ensureEngineRunning();
      } else {
        console.log(chalk.green("[ℹ] Local VOICEVOX Engine detected. Skipping download."));
      }

      console.log(chalk.gray(
        "\nNote: Voice is generated via VOICEVOX. If you share the voice output publicly, " +
        "you must provide credit according to the character's terms — see README for details.\n"
      ));
    } catch (e: any) {
      console.log(chalk.red(`Failed to initialize Voice Engine: ${e.message}`));
      voiceEnabled = false; // Fallback to text only
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  // Multi-Memory System
  let memory: Record<string, any[]> = {
    eli: [],
    rei: [],
    sora: [],
    rin: []
  };
  
  let sessionState: SessionState = { filesTouched: new Set() };
  let oldPersonaNameForHandoff = "";
  let lastUserPrompt = "";

  while (true) {
    const input = await interactivePrompt(chalk.green("👤 You ❯ "), {
      personaColor: getPersonaColor(activePersona),
    });
    if (!input.trim()) continue;

    if (input.startsWith("/exit")) {
      console.log(chalk.gray("Goodbye! 👋"));
      break;
    }

    if (input.startsWith("/clear")) {
      showBanner();
      continue;
    }

    if (input.startsWith("/help")) {
      console.log(chalk.cyan("\nAvailable Commands:"));
      console.log(chalk.cyan("  /help                : Show this help menu"));
      console.log(chalk.cyan("  /persona <name>      : Change persona (eli/rei/sora/rin)"));
      console.log(chalk.cyan("  /model <name>        : Change model (e.g., gemini-3.5-flash-lite)"));
      console.log(chalk.cyan("  /provider <name>     : Change provider (google/openai/openrouter/local)"));
      console.log(chalk.cyan("  /provider fallback <name> [model] : Set failover fallback provider"));
      console.log(chalk.cyan("  /api <prov> <key>    : Save API Key (e.g., /api google AIza...)"));
      console.log(chalk.cyan("  /undo                : Undo last file write or edit"));
      console.log(chalk.cyan("  /paste               : Enter multi-line paste mode (end with 'END')"));
      console.log(chalk.cyan("  /retry               : Retry the last prompt"));
      console.log(chalk.cyan("  /session save [name] : Save current session memory"));
      console.log(chalk.cyan("  /session load <name> : Load a saved session"));
      console.log(chalk.cyan("  /session list        : List all saved sessions"));
      console.log(chalk.cyan("  /clear               : Clear the console screen"));
      console.log(chalk.cyan("  /exit                : Exit the application\n"));
      continue;
    }

    if (input.startsWith("/undo")) {
      const result = await undoLastChange();
      if (result.success) {
        console.log(chalk.green(`[ℹ] Undo successful: ${result.message}`));
      } else {
        console.log(chalk.yellow(`[ℹ] ${result.message}`));
      }
      continue;
    }

    if (input.startsWith("/session")) {
      const parts = input.trim().split(/\s+/);
      const subCommand = parts[1]?.toLowerCase();
      const sessionName = parts[2];

      if (subCommand === "save") {
        const name = sessionName || `session_${Date.now()}`;
        const res = await saveSession(name, memory, sessionState);
        if (res.success) {
          console.log(chalk.green(`[ℹ] ${res.message}`));
        } else {
          console.log(chalk.red(`[ℹ] ${res.message}`));
        }
      } else if (subCommand === "load") {
        if (!sessionName) {
          console.log(chalk.red("Invalid format! Use: /session load <name>"));
        } else {
          const res = await loadSession(sessionName);
          if (res.success && res.data) {
            memory = {
              eli: res.data.memory?.eli || [],
              rei: res.data.memory?.rei || [],
              sora: res.data.memory?.sora || [],
              rin: res.data.memory?.rin || [],
            };
            sessionState = {
              filesTouched: new Set(res.data.sessionState?.filesTouched || []),
            };
            console.log(chalk.green(`[ℹ] ${res.message}`));
          } else {
            console.log(chalk.red(`[ℹ] ${res.message}`));
          }
        }
      } else if (subCommand === "list") {
        const sessions = await listSessions();
        if (sessions.length === 0) {
          console.log(chalk.gray("[ℹ] No saved sessions found."));
        } else {
          console.log(chalk.cyan("\nSaved Sessions:"));
          sessions.forEach((s) => console.log(chalk.cyan(`  - ${s}`)));
          console.log("");
        }
      } else {
        console.log(chalk.red("Invalid session command! Use: /session save [name], /session load <name>, /session list"));
      }
      continue;
    }

    if (input.startsWith("/api ")) {
      const parts = input.split(" ");
      const prov = parts[1];
      const key = parts[2];
      if (prov && key) {
        config.apiKeys = config.apiKeys || {};
        config.apiKeys[prov] = key;
        setConfig(config);
        console.log(chalk.gray(`[ℹ] API Key for ${prov} has been saved.`));
      } else {
        console.log(chalk.red("Invalid format! Use: /api <provider> <key>"));
      }
      continue;
    }

    if (input.startsWith("/model ")) {
      const newModel = input.split(" ")[1];
      if (newModel) {
        model = newModel;
        config.model = model;
        setConfig(config);
        console.log(chalk.gray(`[ℹ] Model changed to ${model}`));
      }
      continue;
    }

    if (input.startsWith("/provider ")) {
      const parts = input.trim().split(/\s+/);
      if (parts[1]?.toLowerCase() === "fallback") {
        const fbProvider = parts[2]?.toLowerCase() as Provider;
        const fbModel = parts[3];
        if (["google", "openai", "openrouter", "local"].includes(fbProvider)) {
          config.fallbackProvider = fbProvider;
          if (fbModel) config.fallbackModel = fbModel;
          setConfig(config);
          console.log(chalk.gray(`[ℹ] Fallback provider set to ${fbProvider}${fbModel ? ` (${fbModel})` : ""}`));
        } else if (parts[2]?.toLowerCase() === "off" || parts[2]?.toLowerCase() === "none") {
          delete config.fallbackProvider;
          delete config.fallbackModel;
          setConfig(config);
          console.log(chalk.gray("[ℹ] Fallback provider disabled."));
        } else {
          console.log(chalk.red("Invalid fallback provider! Use: google, openai, openrouter, local (or 'off')"));
        }
        continue;
      }

      const newProvider = input.split(" ")[1];
      if (["google", "openai", "openrouter", "local"].includes(newProvider?.toLowerCase())) {
        provider = newProvider.toLowerCase() as any;
        config.provider = provider;
        setConfig(config);
        console.log(chalk.gray(`[ℹ] Provider changed to ${provider}`));
      } else {
        console.log(chalk.red("Invalid provider! Use: google, openai, openrouter, local"));
      }
      continue;
    }

    if (input.startsWith("/persona ")) {
      const newPersona = input.split(" ")[1]?.toLowerCase();
      if (newPersona && ["eli", "rei", "sora", "rin"].includes(newPersona) && newPersona !== activePersona) {
        // Sliding Window Handoff with SessionState
        const currentHistory = memory[activePersona];
        oldPersonaNameForHandoff = activePersona;

        activePersona = newPersona as any;
        config.activePersona = activePersona;
        setConfig(config);
        broadcastPersonaEvent(activePersona);

        if (currentHistory.length > 0) {
          const handoffNote = buildHandoffNote(oldPersonaNameForHandoff, currentHistory, sessionState);
          memory[activePersona].push(
            { role: "user", content: handoffNote },
            { role: "assistant", content: "[SYSTEM: Context accepted. Persona initialized. Ready to respond in the user's language.]" }
          );
        }

        // Reset session state for the new persona's session
        sessionState = { filesTouched: new Set() };

        console.log(chalk.gray(`[ℹ] Persona changed to ${activePersona.toUpperCase()}`));
      } else if (newPersona === activePersona) {
        console.log(chalk.gray(`[ℹ] Persona is already ${activePersona.toUpperCase()}`));
      } else {
        console.log(chalk.red("Invalid persona! Use: eli, rei, sora, rin"));
      }
      continue;
    }

    let finalInput = input;

    if (input.trim() === "/paste") {
      console.log(chalk.cyan("\n📋 Entering Multi-line Paste Mode."));
      console.log(chalk.gray("Paste your text below. Type 'END' on a new line to submit, or 'CANCEL' to abort.\n"));
      const pasteLines: string[] = [];
      while (true) {
        const line = await rl.question(chalk.gray("... "));
        if (line.trim().toUpperCase() === "CANCEL") {
          console.log(chalk.yellow("[ℹ] Paste cancelled."));
          pasteLines.length = 0;
          break;
        }
        if (line.trim().toUpperCase() === "END") {
          break;
        }
        pasteLines.push(line);
      }
      if (pasteLines.length === 0) continue;
      finalInput = pasteLines.join("\n");
      console.log(chalk.gray(`[ℹ] Captured ${pasteLines.length} lines.`));
    } else if (input.trim() === "/retry") {
      if (!lastUserPrompt) {
        console.log(chalk.yellow("[ℹ] No previous message to retry."));
        continue;
      }
      const popRes = popLastTurnForRetry(memory[activePersona]);
      if (!popRes.success) {
        console.log(chalk.yellow("[ℹ] No previous turn found to retry."));
        continue;
      }
      finalInput = lastUserPrompt;
      console.log(chalk.cyan(`[ℹ] Retrying: "${finalInput.length > 50 ? finalInput.slice(0, 50) + "..." : finalInput}"`));
    }

    lastUserPrompt = finalInput;

    memory[activePersona].push({ role: "user", content: finalInput });

    const colorName = getPersonaColor(activePersona) as keyof typeof chalk;
    const colorFn = (chalk as any)[colorName] || chalk.white;
    const spinner = ora(`Elenalyse (${activePersona.toUpperCase()}) is thinking...`).start();

    // Pause rl to avoid stdin conflicts with runCommandTool
    rl.pause();

    const abortController = new AbortController();
    let isAborted = false;

    const sigintHandler = () => {
      isAborted = true;
      abortController.abort();
    };
    process.on("SIGINT", sigintHandler);

    let runProvider = provider;
    let runModel = model;
    let hasAttemptedFallback = false;

    try {
      while (true) {
        try {
          const aiModel = await getAiClient(runProvider, runModel, config);

          // Trim memory before sending to API
          memory[activePersona] = trimMemory(memory[activePersona], memoryMode, debug);

          const toolsMap = {
            readFile: readFileTool,
            listDir: listDirTool,
            gitStatus: gitStatusTool,
            gitDiff: gitDiffTool,
            searchCode: searchCodeTool,
            findFiles: findFilesTool,
            writeFile: createWriteFileTool(
              () => spinner.stop(),
              () => spinner.start(),
              rl
            ),
            editFile: createEditFileTool(
              () => spinner.stop(),
              () => spinner.start(),
              rl
            ),
            runCommand: createRunCommandTool(
              () => spinner.stop(),
              () => spinner.start(),
              rl
            )
          };

          const currentMessages: any[] = [...memory[activePersona]];
          let previousToolCallsStr = "";
          let finalText = "";
          let totalPromptTokens = 0;
          let totalCompletionTokens = 0;

          for (let step = 1; step <= MAX_AUTONOMOUS_STEPS; step++) {
            if (isAborted) break;

            const genResult = await generateText({
              model: aiModel,
              abortSignal: abortController.signal,
              system: await getPersonaPrompt(activePersona, voiceEnabled),
              messages: currentMessages,
              tools: toolsMap,
              // @ts-ignore
              maxSteps: 1,
            });

            if (genResult.usage) {
              totalPromptTokens += (genResult.usage as any).promptTokens || 0;
              totalCompletionTokens += (genResult.usage as any).completionTokens || 0;
            }

            // 1. Check native tool calls
            if (genResult.toolCalls && genResult.toolCalls.length > 0) {
              for (const tc of genResult.toolCalls) {
                const args = (tc as any).args;
                const filePath = args?.filePath || args?.path || args?.file || args?.filename || args?.dirPath;
                if (filePath && typeof filePath === "string") {
                  sessionState.filesTouched.add(filePath);
                }
              }

              const tc = genResult.toolCalls[0];
              const argsSummary = formatToolArgs((tc as any).args || {});
              spinner.text = `${colorFn("⚡")} ${activePersona.toUpperCase()} is analyzing: calling ${tc.toolName}(${argsSummary}) [Step ${step}/${MAX_AUTONOMOUS_STEPS}]...`;

              if (genResult.response && genResult.response.messages) {
                currentMessages.push(...genResult.response.messages);
              } else {
                currentMessages.push({
                  role: "assistant",
                  content: genResult.text || `[Calling tool ${tc.toolName}]`,
                });
              }
              continue;
            }

            // 2. Check text-based XML or JSON tool calls
            const { toolCalls: textToolCalls } = extractTextToolCalls(genResult.text || "");
            if (textToolCalls.length > 0) {
              let loopDetected = false;
              let combinedToolOutputs = "";

              for (const tc of textToolCalls) {
                const toolCallSig = `${tc.toolName}:${JSON.stringify(tc.args)}`;
                if (toolCallSig === previousToolCallsStr) {
                  spinner.warn(chalk.yellow(`Agent loop detected: repeated identical tool call ${tc.toolName}.`));
                  loopDetected = true;
                  break;
                }
                previousToolCallsStr = toolCallSig;

                const argsSummary = formatToolArgs(tc.args);
                spinner.text = `${colorFn("⚡")} ${activePersona.toUpperCase()} is analyzing: calling ${tc.toolName}(${argsSummary}) [Step ${step}/${MAX_AUTONOMOUS_STEPS}]...`;

                const filePath = tc.args?.filePath || tc.args?.dirPath;
                if (filePath && typeof filePath === "string") {
                  sessionState.filesTouched.add(filePath);
                }

                const toolOutput = await executeToolDirectly(tc.toolName, tc.args, toolsMap);
                combinedToolOutputs += `[System Tool Result for "${tc.toolName}"]:\n${toolOutput}\n\n`;
              }

              if (loopDetected) {
                finalText = stripToolCallTags(genResult.text || "");
                break;
              }

              currentMessages.push({
                role: "assistant",
                content: genResult.text,
              });
              currentMessages.push({
                role: "user",
                content: `${combinedToolOutputs.trim()}\n\nPlease proceed with your analysis or provide your final report.`,
              });
              continue;
            }

            // 3. No tool calls - this is the final report
            finalText = stripToolCallTags(genResult.text || "");
            currentMessages.push({
              role: "assistant",
              content: stripVoiceTags(finalText),
            });
            break;
          }

          spinner.stop();

          if (!finalText && currentMessages.length > memory[activePersona].length && !isAborted) {
            spinner.start(`Generating final summary...`);
            const finalSummaryRun = await generateText({
              model: aiModel,
              abortSignal: abortController.signal,
              system: await getPersonaPrompt(activePersona, voiceEnabled),
              messages: [
                ...currentMessages,
                {
                  role: "user",
                  content: "[System: Max analysis steps reached. Please provide your final comprehensive summary based on all findings so far.]",
                },
              ],
            });
            spinner.stop();
            finalText = stripToolCallTags(finalSummaryRun.text || "");
            if (finalSummaryRun.usage) {
              totalPromptTokens += (finalSummaryRun.usage as any).promptTokens || 0;
              totalCompletionTokens += (finalSummaryRun.usage as any).completionTokens || 0;
            }
            currentMessages.push({
              role: "assistant",
              content: stripVoiceTags(finalText),
            });
          }

          if (finalText) {
            console.log(colorFn(`🧊 Elenalyse (${activePersona.toUpperCase()}): `) + finalText);
          }

          // Save to memory
          memory[activePersona] = sanitizeForMemory(currentMessages);

          let { displayText, voiceLines } = extractVoiceSegments(finalText, debug);
          console.log(chalk.gray(`[Token Usage: ${totalPromptTokens} input / ${totalCompletionTokens} output]`));

          if (debug) {
            console.log(chalk.gray(`[DEBUG] Memory (${memory[activePersona].length} messages):`));
            memory[activePersona].forEach((m: any, i: number) => {
              const preview = typeof m.content === "string" 
                ? m.content.slice(0, 80).replace(/\n/g, "\\n") 
                : `[${Array.isArray(m.content) ? m.content.length + " parts" : typeof m.content}]`;
              console.log(chalk.gray(`  [${i}] ${m.role}: ${preview}${typeof m.content === "string" && m.content.length > 80 ? "..." : ""}`));
            });
          }
          console.log("");

          if (voiceEnabled && voiceLines.length > 0) {
            const speakerId = PERSONA_SPEAKER_MAP[activePersona] || 2;
            playVoiceLines(voiceLines, speakerId); // Fire and forget
          }

          break; // Successfully finished turn
        } catch (innerError: any) {
          if (!isAborted && !hasAttemptedFallback && config.fallbackProvider && config.fallbackProvider !== runProvider && isFailoverError(innerError)) {
            hasAttemptedFallback = true;
            spinner.stop();
            console.log(chalk.yellow(`\n[Notice: Switched to fallback provider ${config.fallbackProvider} due to error]`));
            runProvider = config.fallbackProvider;
            runModel = config.fallbackModel || model;
            spinner.start(`Elenalyse (${activePersona.toUpperCase()}) is retrying with ${runProvider}...`);
            continue;
          }
          throw innerError;
        }
      }
    } catch (error: any) {
      spinner.stop();
      if (isAborted || abortController.signal.aborted || error.name === "AbortError" || error.message?.includes("aborted")) {
        console.log(chalk.yellow("\n⚠️ Generation aborted by user."));
      } else {
        console.log(chalk.red("\n✖ Failed to get response from AI engine."));
        console.log(chalk.red(error.message));
      }
      memory[activePersona].pop(); // Revert user message so they can retry
    } finally {
      process.off("SIGINT", sigintHandler);
      rl.resume();
    }
  }
  
  rl.close();
  stopBridgeServer();
}
