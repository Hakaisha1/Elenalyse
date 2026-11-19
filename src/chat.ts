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
import { getConfig, setConfig, isFailoverError, executeWithFailover, Provider, MemoryMode } from "./config.js";
export { isFailoverError, executeWithFailover, MemoryMode };
import { getPersonaPrompt, getPersonaColor, PERSONA_SPEAKER_MAP } from "./personas.js";
import { readFileTool, listDirTool, gitStatusTool, gitDiffTool, searchCodeTool, findFilesTool, createRunCommandTool, createWriteFileTool, createEditFileTool } from "./tools.js";
import { ensureEngineDownloaded, ensureEngineRunning } from "./voiceEngine.js";
import { synthesizeSpeech } from "./tts.js";
import { undoLastChange } from "./undo.js";
import { saveSession, loadSession, listSessions } from "./session.js";
import { renderWelcomeBanner, printWelcomeBanner, renderSettingsBox } from "./ui/banner.js";
import { interactivePrompt } from "./ui/prompt.js";
import { renderMarkdown } from "./ui/markdown.js";
import { pruneMemoryToolResults } from "./memoryPruner.js";
import { renderTokenWarningBox, runPartyOrchestration } from "./party.js";
export { renderWelcomeBanner, printWelcomeBanner, renderSettingsBox, interactivePrompt, renderMarkdown, pruneMemoryToolResults, renderTokenWarningBox, runPartyOrchestration };
import { extractTextToolCalls, stripToolCallTags, canonicalToolName, normalizeToolArgs, ParsedToolCall } from "./toolParser.js";
export { extractTextToolCalls, stripToolCallTags, canonicalToolName, normalizeToolArgs, ParsedToolCall };
import {
  emitAvatarState,
  syncAvatarPersona,
  launchDesktopCompanion,
  stopDesktopCompanion,
  renderLiveStatusBox,
  getLiveStatusSummary,
} from "./avatar/index.js";

export const MAX_AUTONOMOUS_STEPS = 25;

export function getAutonomousStepLimitPrompt(): string {
  return "[System: Autonomous step limit reached. You MUST formulate and output your complete, comprehensive final report to the user now in Markdown. DO NOT call any more tools or output <tool_call> tags.]";
}

export function getSummaryRecoveryPrompt(toolResult?: { toolName: string; output: string }): string {
  if (toolResult && toolResult.toolName) {
    return `[System: Tool "${toolResult.toolName}" result:\n${toolResult.output}\n\nDo not call any more tools. Deliver your complete analysis report now based on all files inspected above.]`;
  }
  return "[System: Previous response only contained a tool call. Do not call tools. Deliver your complete analysis report now based on all files inspected above.]";
}

export function getFinalSummaryFallbackText(stepCount: number): string {
  return `Analysis completed across ${stepCount} steps. Please ask specific questions about the inspected files.`;
}

export function buildFixInstruction(target: string = "all"): string {
  const cleanTarget = target.trim() || "all";
  return `Please execute the necessary code edits using editFile and writeFile to resolve all [${cleanTarget}] identified in your previous audit report. Verify each change and inspect the diff.`;
}

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

export function extractVoiceSegments(
  responseText: string,
  debug: boolean = false
): { displayText: string; voiceLines: VoiceSegment[] } {
  if (!responseText) return { displayText: "", voiceLines: [] };
  const voiceLines: VoiceSegment[] = [];

  // Match <voice ...>content</voice> (case-insensitive, flexible attributes)
  const voiceBlockRegex = /<voice(?:\s+[^>]*?)?>([\s\S]*?)<\/voice>/gi;

  let displayText = responseText.replace(voiceBlockRegex, (match, content) => {
    const emotionMatch = match.match(/emotion=["']?([^"'\s>]+)["']?/i);
    const emotion = emotionMatch ? emotionMatch[1] : undefined;
    const cleanContent = content.trim();

    if (cleanContent) {
      voiceLines.push({ text: cleanContent, emotion });
    }

    if (debug && cleanContent) {
      return chalk.magenta(`\n[VOICE${emotion ? ` (${emotion})` : ""}: ${cleanContent}]\n`);
    }
    return "";
  });

  // Handle unclosed <voice ...> at end of string
  const unclosedVoiceRegex = /<voice(?:\s+[^>]*?)?>([\s\S]*)$/gi;
  displayText = displayText.replace(unclosedVoiceRegex, (match, content) => {
    const emotionMatch = match.match(/emotion=["']?([^"'\s>]+)["']?/i);
    const emotion = emotionMatch ? emotionMatch[1] : undefined;
    const cleanContent = content.trim();

    if (cleanContent) {
      voiceLines.push({ text: cleanContent, emotion });
    }

    if (debug && cleanContent) {
      return chalk.magenta(`\n[VOICE${emotion ? ` (${emotion})` : ""}: ${cleanContent}]\n`);
    }
    return "";
  });

  // Clean up any remaining stray tags like </voice> or self-closing <voice .../>
  displayText = displayText
    .replace(/<\/?voice(?:\s+[^>]*?)?\/?>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { displayText, voiceLines };
}

export function stripVoiceTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/<voice(?:\s+[^>]*?)?>[\s\S]*?<\/voice>/gi, "")
    .replace(/<voice(?:\s+[^>]*?)?>[\s\S]*$/gi, "")
    .replace(/<\/?voice(?:\s+[^>]*?)?\/?>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  emitAvatarState("speaking", { detail: "voice_playback", persona: activePersona });

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

  emitAvatarState("success", { detail: "turn_complete", persona: activePersona });
}

export async function handleChat(message: string, voiceEnabled: boolean, debug: boolean = false) {
  if (!message) {
    console.log(chalk.red("Error: Message is required."));
    process.exit(1);
  }

  const { activePersona, provider, model } = getConfig();
  syncAvatarPersona(activePersona);
  emitAvatarState("thinking", { detail: "prompt_submitted", persona: activePersona });

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
        const maxSteps = config.maxSteps || MAX_AUTONOMOUS_STEPS;

        for (let step = 1; step <= maxSteps; step++) {
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
            spinner.text = `${activePersona.toUpperCase()} is analyzing: calling ${tc.toolName}(${argsSummary}) [Step ${step}/${maxSteps}]...`;
            emitAvatarState("executing", { detail: `calling ${tc.toolName}(${argsSummary}) [Step ${step}/${maxSteps}]`, persona: activePersona });

            if (genResult.response && genResult.response.messages) {
              currentMessages.push(...genResult.response.messages);
            } else {
              currentMessages.push({
                role: "assistant",
                content: genResult.text || `[Calling tool ${tc.toolName}]`,
              });
            }
            emitAvatarState("thinking", { detail: "evaluating_tool_result", persona: activePersona });
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
              spinner.text = `${activePersona.toUpperCase()} is analyzing: calling ${tc.toolName}(${argsSummary}) [Step ${step}/${maxSteps}]...`;
              emitAvatarState("executing", { detail: `calling ${tc.toolName}(${argsSummary}) [Step ${step}/${maxSteps}]`, persona: activePersona });

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
            emitAvatarState("thinking", { detail: "evaluating_tool_result", persona: activePersona });
            continue;
          }

          // 3. No tool calls - this is the final report
          finalText = stripToolCallTags(genResult.text || "");
          break;
        }

        spinner.stop();

        if (!finalText && currentMessages.length > 1) {
          spinner.start("Generating final summary...");
          // Stage 1: Formulate with strict autonomous step limit prompt
          const finalSummaryRun = await generateText({
            model: aiClientFactory,
            system: systemPrompt,
            messages: [
              ...currentMessages,
              {
                role: "user",
                content: getAutonomousStepLimitPrompt(),
              },
            ],
          });
          if (finalSummaryRun.usage) {
            totalPromptTokens += (finalSummaryRun.usage as any).promptTokens || 0;
            totalCompletionTokens += (finalSummaryRun.usage as any).completionTokens || 0;
          }
          finalText = stripToolCallTags(finalSummaryRun.text || "").trim();

          // Stage 2: If model returned another tool call or empty text
          if (!finalText) {
            const { toolCalls: recToolCalls } = extractTextToolCalls(finalSummaryRun.text || "");
            let recResult: { toolName: string; output: string } | undefined;
            if (recToolCalls.length > 0) {
              const recTool = recToolCalls[0];
              const recOutput = await executeToolDirectly(recTool.toolName, recTool.args, toolsMap);
              recResult = { toolName: recTool.toolName, output: recOutput };
            }

            const recRun = await generateText({
              model: aiClientFactory,
              system: systemPrompt,
              messages: [
                ...currentMessages,
                {
                  role: "user",
                  content: getSummaryRecoveryPrompt(recResult),
                },
              ],
            });
            if (recRun.usage) {
              totalPromptTokens += (recRun.usage as any).promptTokens || 0;
              totalCompletionTokens += (recRun.usage as any).completionTokens || 0;
            }
            finalText = stripToolCallTags(recRun.text || "").trim();
          }

          // Stage 3: Fallback if still empty to prevent dead silence
          if (!finalText) {
            finalText = getFinalSummaryFallbackText(maxSteps);
          }
          spinner.stop();
        }

        const { displayText, voiceLines } = extractVoiceSegments(finalText, debug);

        console.log(colorFn(`Elenalyse (${activePersona.toUpperCase()}):\n`) + renderMarkdown(displayText, activePersona));
        console.log(chalk.gray(`\n[Token Usage: ${totalPromptTokens} input / ${totalCompletionTokens} output]`));

        if (voiceEnabled && voiceLines.length > 0) {
          await startBridgeServer();
          const speakerId = PERSONA_SPEAKER_MAP[activePersona] || 2;
          await playVoiceLines(voiceLines, speakerId);
        } else {
          emitAvatarState("success", { detail: "turn_complete", persona: activePersona });
        }
        break; // Successfully finished
      } catch (innerError: any) {
        if (!hasAttemptedFallback && config.fallbackProvider && config.fallbackProvider !== runProvider && isFailoverError(innerError)) {
          hasAttemptedFallback = true;
          spinner.stop();
          console.log(chalk.yellow(`\n[Notice: Switched to fallback provider ${config.fallbackProvider} due to error]`));
          runProvider = config.fallbackProvider;
          runModel = config.fallbackModel || model;
          emitAvatarState("thinking", { detail: "provider_failover", persona: activePersona });
          spinner.start(`Elenalyse (${activePersona.toUpperCase()}) is retrying with ${runProvider}...`);
          continue;
        }
        throw innerError;
      }
    }
  } catch (error: any) {
    spinner.fail("Failed to get response from AI engine.");
    console.error(chalk.red(error.message));
    emitAvatarState("error", { detail: error.message, persona: activePersona });
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
  memoryMode?: MemoryMode
) {
  let config = getConfig();
  let activePersona = config.activePersona;
  let provider = config.provider;
  let model = config.model;
  let activeMemoryMode: MemoryMode = memoryMode || config.memoryMode || "default";
  let activeVoiceEnabled: boolean = voiceEnabled || config.voiceEnabled || false;
  
  const showBanner = () => {
    printWelcomeBanner({
      persona: activePersona,
      provider,
      model,
      fallbackProvider: config.fallbackProvider,
      fallbackModel: config.fallbackModel,
      memoryMode: activeMemoryMode,
      voiceEnabled: activeVoiceEnabled,
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
    const input = await interactivePrompt(chalk.green("You ❯ "), {
      personaColor: getPersonaColor(activePersona),
    });
    if (!input.trim()) continue;

    if (input.startsWith("/exit")) {
      console.log(chalk.gray("Goodbye!"));
      break;
    }

    if (input.startsWith("/clear")) {
      showBanner();
      continue;
    }

    if (input.startsWith("/setting") || input.startsWith("/settings")) {
      const parts = input.trim().split(/\s+/);
      const subCommand = parts[1]?.toLowerCase();
      const val = parts[2]?.toLowerCase();

      if (!subCommand || subCommand === "show") {
        console.log("\n" + renderSettingsBox({
          memoryMode: activeMemoryMode,
          maxSteps: config.maxSteps || MAX_AUTONOMOUS_STEPS,
          provider,
          model,
          fallbackProvider: config.fallbackProvider,
          fallbackModel: config.fallbackModel,
          voiceEnabled: activeVoiceEnabled,
        }) + "\n");
        continue;
      }

      if (subCommand === "memory") {
        if (["amnesia", "default", "focus"].includes(val)) {
          activeMemoryMode = val as MemoryMode;
          config.memoryMode = activeMemoryMode;
          setConfig(config);
          console.log(chalk.green(`[ℹ] Memory mode updated to '${activeMemoryMode}' (${MEMORY_LIMITS[activeMemoryMode]} messages limit).`));
        } else {
          console.log(chalk.red("Invalid memory mode! Use: /setting memory <amnesia|default|focus>"));
        }
        continue;
      }

      if (subCommand === "steps") {
        const parsedSteps = parseInt(val, 10);
        if (!isNaN(parsedSteps) && parsedSteps >= 1 && parsedSteps <= 100) {
          config.maxSteps = parsedSteps;
          setConfig(config);
          console.log(chalk.green(`[ℹ] Maximum autonomous inspection steps updated to ${parsedSteps}.`));
        } else {
          console.log(chalk.red("Invalid steps value! Use: /setting steps <number between 1 and 100> (e.g. 15, 25, 40)"));
        }
        continue;
      }

      if (subCommand === "voice") {
        if (val === "on" || val === "true" || val === "enable") {
          activeVoiceEnabled = true;
          config.voiceEnabled = true;
          setConfig(config);
          console.log(chalk.green("[ℹ] Voice synthesis enabled (VOICEVOX Engine)."));
        } else if (val === "off" || val === "false" || val === "disable") {
          activeVoiceEnabled = false;
          config.voiceEnabled = false;
          setConfig(config);
          console.log(chalk.yellow("[ℹ] Voice synthesis disabled (Text only)."));
        } else {
          console.log(chalk.red("Invalid voice setting! Use: /setting voice <on|off>"));
        }
        continue;
      }

      console.log(chalk.red("Unknown setting command! Use: /setting [show|memory|steps|voice]"));
      continue;
    }

    if (input.startsWith("/help")) {
      console.log(chalk.cyan("\nAvailable Commands:"));
      console.log(chalk.cyan("  /help                : Show this help menu"));
      console.log(chalk.cyan("  /setting [show|..]   : Configure runtime settings (memory, steps, voice)"));
      console.log(chalk.cyan("  /persona <name>      : Change persona (eli/rei/sora/rin)"));
      console.log(chalk.cyan("  /model <name>        : Change model (e.g., gemini-3.5-flash-lite)"));
      console.log(chalk.cyan("  /provider <name>     : Change provider (google/openai/openrouter/local)"));
      console.log(chalk.cyan("  /provider fallback <name> [model] : Set failover fallback provider"));
      console.log(chalk.cyan("  /api <prov> <key>    : Save API Key (e.g., /api google AIza...)"));
      console.log(chalk.cyan("  /fix [blockers|..]   : Automatically execute fixes for audit issues"));
      console.log(chalk.cyan("  /party [audit|..]    : Orchestrate all 4 personas simultaneously (Token Intensive)"));
      console.log(chalk.cyan("  /live [on|off|..]    : Launch or manage 3D Reactive Avatar companion (ELI/REI)"));
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
        syncAvatarPersona(activePersona);
        emitAvatarState("idle", { detail: "persona_changed", persona: activePersona });

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

    if (input.startsWith("/party")) {
      const taskArg = input.slice(6).trim() || "Full Quartet audit (Security, Architecture, Creativity, Synthesis)";

      console.log("\n" + renderTokenWarningBox() + "\n");
      const answer = await rl.question(chalk.yellow("[!] Do you want to proceed with Party Mode orchestration? [Y/n]: "));
      if (answer.trim().toLowerCase() !== "y" && answer.trim() !== "") {
        console.log(chalk.yellow("[ℹ] Party Mode cancelled by user.\n"));
        continue;
      }

      rl.pause();
      const partySpinner = ora("Party Mode: RIN, REI, and SORA analyzing simultaneously under ELI...").start();

      try {
        const aiModel = await getAiClient(provider, model, config);
        const partyResult = await runPartyOrchestration({
          task: taskArg,
          aiClientFactory: aiModel,
          onProgress: (status) => {
            partySpinner.text = `[Party] ${status}`;
          },
        });

        partySpinner.stop();

        if (partyResult.cancelled) {
          console.log(chalk.yellow("[ℹ] " + partyResult.report + "\n"));
        } else {
          console.log("\n" + renderMarkdown(partyResult.report, "eli") + "\n");
          console.log(chalk.gray(`[Token Usage: ${partyResult.totalTokens.promptTokens} input / ${partyResult.totalTokens.completionTokens} output]\n`));

          // Save into conversation memory
          memory[activePersona].push({
            role: "user",
            content: input,
          });
          memory[activePersona].push({
            role: "assistant",
            content: partyResult.report,
          });
        }
      } catch (err: any) {
        partySpinner.stop();
        console.log(chalk.red(`\n✖ Party Mode execution failed: ${err.message}\n`));
      } finally {
        rl.resume();
      }
      continue;
    }

    if (input.startsWith("/live")) {
      const parts = input.trim().split(/\s+/);
      const subCommand = parts[1]?.toLowerCase();

      if (subCommand === "eli") {
        activePersona = "eli";
        config.activePersona = "eli";
        setConfig({ activePersona: "eli" });
        syncAvatarPersona("eli");
        emitAvatarState("idle", { detail: "live_model_switch", persona: "eli" });
        console.log(chalk.green(`[Live] Switched 3D avatar model to ELI (ELI_Model.vrm)`));
        continue;
      }

      if (subCommand === "rei") {
        activePersona = "rei";
        config.activePersona = "rei";
        setConfig({ activePersona: "rei" });
        syncAvatarPersona("rei");
        emitAvatarState("idle", { detail: "live_model_switch", persona: "rei" });
        console.log(chalk.green(`[Live] Switched 3D avatar model to REI (REI_Model.vrm)`));
        continue;
      }

      if (subCommand === "status") {
        console.log("\n" + renderLiveStatusBox() + "\n");
        continue;
      }

      if (subCommand === "off") {
        const stopped = stopDesktopCompanion();
        if (stopped) {
          console.log(chalk.yellow(`[Live] Stopped 3D desktop companion background process.`));
        } else {
          console.log(chalk.gray(`[Live] No background 3D desktop companion process is currently tracked.`));
        }
        continue;
      }

      if (!subCommand || subCommand === "on" || subCommand === "launch") {
        await startBridgeServer().catch(() => {});
        const launchResult = launchDesktopCompanion({ persona: activePersona });
        if (launchResult.spawned) {
          console.log(chalk.green(`[Live] ${launchResult.message}${launchResult.pid ? ` (PID: ${launchResult.pid})` : ""}`));
        } else {
          console.log(chalk.gray(`[Live] ${launchResult.message}`));
        }
        console.log("\n" + renderLiveStatusBox() + "\n");
        continue;
      }

      console.log(chalk.red(`[Live] Unknown subcommand '${subCommand}'! Use: /live [on|off|status|eli|rei|launch]`));
      continue;
    }

    let finalInput = input;

    if (input.trim() === "/paste") {
      console.log(chalk.cyan("\nEntering Multi-line Paste Mode."));
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
    } else if (input.startsWith("/fix")) {
      const rest = input.slice(4).trim();
      const target = rest || "all";
      finalInput = buildFixInstruction(target);
      console.log(chalk.cyan(`[ℹ] Initiating autonomous fix for [${target}]...`));
    }

    lastUserPrompt = finalInput;

    memory[activePersona].push({ role: "user", content: finalInput });
    emitAvatarState("thinking", { detail: "prompt_submitted", persona: activePersona });

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
          memory[activePersona] = trimMemory(memory[activePersona], activeMemoryMode, debug);

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

          const currentMessages: any[] = [...pruneMemoryToolResults(memory[activePersona])];
          let previousToolCallsStr = "";
          let finalText = "";
          let totalPromptTokens = 0;
          let totalCompletionTokens = 0;
          const maxSteps = input.startsWith("/fix")
            ? Math.max(25, config.maxSteps || MAX_AUTONOMOUS_STEPS)
            : (config.maxSteps || MAX_AUTONOMOUS_STEPS);

          for (let step = 1; step <= maxSteps; step++) {
            if (isAborted) break;

            const genResult = await generateText({
              model: aiModel,
              abortSignal: abortController.signal,
              system: await getPersonaPrompt(activePersona, activeVoiceEnabled),
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
              spinner.text = `${activePersona.toUpperCase()} is analyzing: calling ${tc.toolName}(${argsSummary}) [Step ${step}/${maxSteps}]...`;
              emitAvatarState("executing", { detail: `calling ${tc.toolName}(${argsSummary}) [Step ${step}/${maxSteps}]`, persona: activePersona });

              if (genResult.response && genResult.response.messages) {
                currentMessages.push(...genResult.response.messages);
              } else {
                currentMessages.push({
                  role: "assistant",
                  content: genResult.text || `[Calling tool ${tc.toolName}]`,
                });
              }
              emitAvatarState("thinking", { detail: "evaluating_tool_result", persona: activePersona });
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
                spinner.text = `${activePersona.toUpperCase()} is analyzing: calling ${tc.toolName}(${argsSummary}) [Step ${step}/${maxSteps}]...`;
                emitAvatarState("executing", { detail: `calling ${tc.toolName}(${argsSummary}) [Step ${step}/${maxSteps}]`, persona: activePersona });

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
              emitAvatarState("thinking", { detail: "evaluating_tool_result", persona: activePersona });
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
            spinner.start("Generating final summary...");
            // Stage 1: Formulate with strict autonomous step limit prompt
            const finalSummaryRun = await generateText({
              model: aiModel,
              abortSignal: abortController.signal,
              system: await getPersonaPrompt(activePersona, activeVoiceEnabled),
              messages: [
                ...currentMessages,
                {
                  role: "user",
                  content: getAutonomousStepLimitPrompt(),
                },
              ],
            });
            if (finalSummaryRun.usage) {
              totalPromptTokens += (finalSummaryRun.usage as any).promptTokens || 0;
              totalCompletionTokens += (finalSummaryRun.usage as any).completionTokens || 0;
            }
            finalText = stripToolCallTags(finalSummaryRun.text || "").trim();

            // Stage 2: If model returned another tool call or empty text
            if (!finalText) {
              const { toolCalls: recToolCalls } = extractTextToolCalls(finalSummaryRun.text || "");
              let recResult: { toolName: string; output: string } | undefined;
              if (recToolCalls.length > 0) {
                const recTool = recToolCalls[0];
                const recOutput = await executeToolDirectly(recTool.toolName, recTool.args, toolsMap);
                recResult = { toolName: recTool.toolName, output: recOutput };
              }

              const recRun = await generateText({
                model: aiModel,
                abortSignal: abortController.signal,
                system: await getPersonaPrompt(activePersona, activeVoiceEnabled),
                messages: [
                  ...currentMessages,
                  {
                    role: "user",
                    content: getSummaryRecoveryPrompt(recResult),
                  },
                ],
              });
              if (recRun.usage) {
                totalPromptTokens += (recRun.usage as any).promptTokens || 0;
                totalCompletionTokens += (recRun.usage as any).completionTokens || 0;
              }
              finalText = stripToolCallTags(recRun.text || "").trim();
            }

            // Stage 3: Fallback if still empty to prevent dead silence
            if (!finalText) {
              finalText = getFinalSummaryFallbackText(maxSteps);
            }
            spinner.stop();
            currentMessages.push({
              role: "assistant",
              content: stripVoiceTags(finalText),
            });
          }

          const { displayText, voiceLines } = extractVoiceSegments(finalText, debug);

          if (displayText) {
            console.log(colorFn(`Elenalyse (${activePersona.toUpperCase()}):\n`) + renderMarkdown(displayText, activePersona));
          }

          // Save to memory
          memory[activePersona] = sanitizeForMemory(currentMessages);
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

          if (activeVoiceEnabled && voiceLines.length > 0) {
            const speakerId = PERSONA_SPEAKER_MAP[activePersona] || 2;
            playVoiceLines(voiceLines, speakerId); // Fire and forget (will emit speaking then success upon finish)
          } else {
            emitAvatarState("success", { detail: "turn_complete", persona: activePersona });
          }

          break; // Successfully finished turn
        } catch (innerError: any) {
          if (!isAborted && !hasAttemptedFallback && config.fallbackProvider && config.fallbackProvider !== runProvider && isFailoverError(innerError)) {
            hasAttemptedFallback = true;
            spinner.stop();
            console.log(chalk.yellow(`\n[Notice: Switched to fallback provider ${config.fallbackProvider} due to error]`));
            runProvider = config.fallbackProvider;
            runModel = config.fallbackModel || model;
            emitAvatarState("thinking", { detail: "provider_failover", persona: activePersona });
            spinner.start(`Elenalyse (${activePersona.toUpperCase()}) is retrying with ${runProvider}...`);
            continue;
          }
          throw innerError;
        }
      }
    } catch (error: any) {
      spinner.stop();
      if (isAborted || abortController.signal.aborted || error.name === "AbortError" || error.message?.includes("aborted")) {
        console.log(chalk.yellow("\n[!] Generation aborted by user."));
        emitAvatarState("idle", { detail: "user_aborted", persona: activePersona });
      } else {
        console.log(chalk.red("\n✖ Failed to get response from AI engine."));
        console.log(chalk.red(error.message));
        emitAvatarState("error", { detail: error.message, persona: activePersona });
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
