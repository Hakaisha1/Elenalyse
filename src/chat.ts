import { generateText, streamText } from "ai";
import * as readline from "readline/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import chalk from "chalk";
import ora from "ora";
import fs from "fs";
import os from "os";
import path from "path";
import sound from "sound-play";
import { getConfig, setConfig } from "./config.js";
import { getPersonaPrompt, getPersonaColor, PERSONA_SPEAKER_MAP } from "./personas.js";
import { readFileTool, listDirTool, createRunCommandTool, createWriteFileTool, createEditFileTool } from "./tools.js";
import { ensureEngineDownloaded, ensureEngineRunning } from "./voiceEngine.js";
import { synthesizeSpeech } from "./tts.js";

function extractVoiceSegments(responseText: string, debug: boolean = false): { displayText: string; voiceLines: string[] } {
  if (!responseText) return { displayText: "", voiceLines: [] };
  const voiceLines: string[] = [];
  const displayText = responseText.replace(/<voice>([\s\S]*?)<\/voice>/g, (_, content) => {
    voiceLines.push(content.trim());
    return debug ? chalk.magenta(`\n[VOICE: ${content.trim()}]\n`) : ""; // Hide the voice text from the terminal unless debug is true
  });
  return { displayText: displayText.trim(), voiceLines };
}

function stripVoiceTags(text: string): string {
  return text.replace(/<voice>[\s\S]*?<\/voice>/g, "").trim();
}

function sanitizeForMemory(messages: any[]): any[] {
  return messages.map((m: any) => {
    if (m.role === "assistant") {
      let content: string;
      if (Array.isArray(m.content)) {
        content = m.content
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
      } else {
        content = String(m.content || "");
      }
      return { role: "assistant", content: stripVoiceTags(content) };
    }
    // For tool-call and tool-result messages, keep role + content only
    return { role: m.role, content: m.content };
  });
}

async function playVoiceLines(voiceLines: string[], speakerId: number) {
  for (let i = 0; i < voiceLines.length; i++) {
    try {
      const buffer = await synthesizeSpeech(voiceLines[i], speakerId);
      const tempPath = path.join(os.tmpdir(), `elenalyse_voice_${Date.now()}_${i}.wav`);
      fs.writeFileSync(tempPath, buffer);
      await sound.play(tempPath);
      fs.unlinkSync(tempPath);
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

  try {
    const config = getConfig();
    const aiClientFactory = await getAiClient(provider, model, config);


    const { text, toolCalls, toolResults, usage } = await generateText({
      model: aiClientFactory,
      system: systemPrompt,
      prompt: message,
      tools: {
        readFile: readFileTool,
        listDir: listDirTool,
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
      },
      // @ts-ignore
      maxSteps: 5,
    });

    spinner.stop();
    
    // Robust manual loop for AI SDK version / Provider compatibility issues
    if (!text && toolCalls && toolCalls.length > 0 && toolResults && toolResults.length > 0) {
      const toolSpinner = ora(`Evaluating ${toolCalls[0].toolName} results...`).start();
      
      const evaluationPrompt = `${message}\n\n[System: You called the tool "${toolCalls[0].toolName}" and received this result:\n${JSON.stringify((toolResults[0] as any).result || (toolResults[0] as any).output || "Success", null, 2)}\n\nPlease provide your final answer to the user based on this data. Do not output JSON, speak naturally.]`;

      const secondRun = await generateText({
        model: aiClientFactory,
        system: systemPrompt,
        prompt: evaluationPrompt,
      });

      toolSpinner.stop();
      if (secondRun.usage) {
        (usage as any).promptTokens += (secondRun.usage as any).promptTokens || 0;
        (usage as any).completionTokens += (secondRun.usage as any).completionTokens || 0;
      }
      console.log(colorFn(`Elenalyse (${activePersona.toUpperCase()}): `) + secondRun.text);
    } else {
      console.log(colorFn(`Elenalyse (${activePersona.toUpperCase()}): `) + text);
    }

    console.log(chalk.gray(`\n[Token Usage: ${(usage as any).promptTokens || 0} input / ${(usage as any).completionTokens || 0} output]`));

    if (voiceEnabled) {
      let { displayText, voiceLines } = extractVoiceSegments(text, debug);
      if (voiceLines.length > 0) {
        const speakerId = PERSONA_SPEAKER_MAP[activePersona] || 2;
        playVoiceLines(voiceLines, speakerId);
      }
    }
  } catch (error: any) {
    spinner.fail("Failed to get response from AI engine.");
    console.error(chalk.red(error.message));
  } finally {
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
${recentSummary}`;
}

const MAX_MEMORY_MESSAGES = 40;

function trimMemory(memory: any[], debug: boolean = false): any[] {
  if (memory.length <= MAX_MEMORY_MESSAGES) return memory;
  const trimCount = memory.length - MAX_MEMORY_MESSAGES;
  if (debug) {
    console.log(chalk.gray(`[DEBUG] Memory trimmed: removed ${trimCount} oldest messages (${memory.length} → ${MAX_MEMORY_MESSAGES})`));
  }
  // Keep the most recent messages, drop the oldest
  return memory.slice(trimCount);
}

export async function startInteractiveChat(voiceEnabled: boolean, debug: boolean = false) {
  let config = getConfig();
  let activePersona = config.activePersona;
  let provider = config.provider;
  let model = config.model;
  
  const printWelcome = () => {
    console.clear();
    console.log(chalk.magenta("==================================================="));
    console.log(chalk.magenta.bold("✨ E L E N A L Y S E ✨"));
    console.log(chalk.magenta("==================================================="));
    console.log(chalk.gray(`[ℹ] Provider : ${provider}`));
    console.log(chalk.gray(`[ℹ] Model    : ${model}`));
    console.log(chalk.gray(`[ℹ] Persona  : ${activePersona.toUpperCase()}`));
    console.log(chalk.gray("---------------------------------------------------"));
    console.log(chalk.cyan("Type your message below. Type '/help' to see the list of commands."));
    console.log(chalk.magenta("===================================================\n"));
  };

  printWelcome();

  if (voiceEnabled) {
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

  while (true) {
    const input = await rl.question(chalk.green("👤 You ❯ "));
    if (!input.trim()) continue;

    if (input.startsWith("/exit")) {
      console.log(chalk.gray("Goodbye! 👋"));
      break;
    }

    if (input.startsWith("/clear")) {
      printWelcome();
      continue;
    }

    if (input.startsWith("/help")) {
      console.log(chalk.cyan("\nAvailable Commands:"));
      console.log(chalk.cyan("  /help           : Show this help menu"));
      console.log(chalk.cyan("  /persona <name> : Change persona (eli/rei/sora/rin)"));
      console.log(chalk.cyan("  /model <name>   : Change model (e.g., gemini-3.5-flash-lite)"));
      console.log(chalk.cyan("  /provider <name>: Change provider (google/openai/openrouter/local)"));
      console.log(chalk.cyan("  /api <prov> <key> : Save API Key (e.g., /api google AIza...)"));
      console.log(chalk.cyan("  /clear          : Clear the console screen"));
      console.log(chalk.cyan("  /exit           : Exit the application\n"));
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

        if (currentHistory.length > 0) {
          const handoffNote = buildHandoffNote(oldPersonaNameForHandoff, currentHistory, sessionState);
          memory[activePersona].push(
            { role: "user", content: handoffNote },
            { role: "assistant", content: "Understood. I have reviewed the context and will continue assisting based on my own persona." }
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

    memory[activePersona].push({ role: "user", content: finalInput });

    const colorName = getPersonaColor(activePersona) as keyof typeof chalk;
    const colorFn = (chalk as any)[colorName] || chalk.white;
    const spinner = ora(`Elenalyse (${activePersona.toUpperCase()}) is thinking...`).start();

    // Pause rl to avoid stdin conflicts with runCommandTool
    rl.pause();

    try {
      const aiModel = await getAiClient(provider, model, config);

      // Trim memory before sending to API
      memory[activePersona] = trimMemory(memory[activePersona], debug);

      let previousToolCallsStr = "";

      const result = streamText({
        model: aiModel,
        system: await getPersonaPrompt(activePersona, voiceEnabled),
        messages: memory[activePersona],
        tools: {
          readFile: readFileTool,
          listDir: listDirTool,
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
        },
        // @ts-ignore
        maxSteps: 5,
        onStepFinish: (event) => {
          if (debug) {
            console.log(chalk.gray(`\n[DEBUG] Step completed. Reason: ${event.finishReason}`));
            if (event.text) console.log(chalk.gray(`[DEBUG] Text generated so far: ${event.text.length} chars`));
            if (event.toolCalls && event.toolCalls.length > 0) {
              event.toolCalls.forEach(tc => {
                 console.log(chalk.magenta(`[DEBUG] AI called tool: ${tc.toolName}`));
                 console.log(chalk.gray(`[DEBUG] Args: ${JSON.stringify((tc as any).args)}`));
              });
            }
          }
          if (event.toolCalls && event.toolCalls.length > 0) {
            const currentToolCallsStr = JSON.stringify(event.toolCalls.map(tc => ({ name: tc.toolName, args: (tc as any).args })));
            if (currentToolCallsStr === previousToolCallsStr) {
              console.log(chalk.red(`\n[ERROR] Agent Loop Detected! Repeated identical tool call: ${event.toolCalls[0].toolName}. Aborting.`));
              throw new Error(`Agent loop detected: ${event.toolCalls[0].toolName} called with identical arguments twice in a row.`);
            }
            previousToolCallsStr = currentToolCallsStr;

            // Track files touched for handoff context
            for (const tc of event.toolCalls) {
              const args = (tc as any).args;
              const filePath = args?.filePath || args?.path || args?.file || args?.filename || args?.dirPath;
              if (filePath && typeof filePath === "string") {
                sessionState.filesTouched.add(filePath);
              }
            }
          }
        }
      });

      // Stream text to terminal in real-time
      let headerPrinted = false;
      let fullText = "";

      for await (const chunk of result.textStream) {
        if (!headerPrinted) {
          spinner.stop();
          process.stdout.write(colorFn(`🧊 Elenalyse (${activePersona.toUpperCase()}): `));
          headerPrinted = true;
        }
        process.stdout.write(chunk);
        fullText += chunk;
      }

      // Wait for the full result to finalize (tool calls, usage, etc.)
      const finalResult = await result.response;
      const usage = await result.usage;
      const steps = await result.steps;

      // If no text was streamed (tool-only response), do a follow-up generateText
      if (!fullText && steps && steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        if (lastStep.toolCalls && lastStep.toolCalls.length > 0) {
          spinner.stop();
          const toolSpinner = ora(`Evaluating ${lastStep.toolCalls[0].toolName} results...`).start();

          const evaluationMessages = [...memory[activePersona]];
          if (finalResult && finalResult.messages) {
            evaluationMessages.push(...finalResult.messages);
          }

          const secondRun = await generateText({
            model: aiModel,
            system: await getPersonaPrompt(activePersona, voiceEnabled),
            messages: evaluationMessages,
          });
          toolSpinner.stop();
          fullText = secondRun.text;

          process.stdout.write(colorFn(`🧊 Elenalyse (${activePersona.toUpperCase()}): `) + fullText);
        }
      }

      if (!headerPrinted) spinner.stop();
      process.stdout.write("\n");

      if (steps && steps.length >= 5) {
        console.log(chalk.yellow(`[WARNING] Max steps (5) reached. The AI was forcefully stopped.`));
      }

      // Save to memory
      if (finalResult && finalResult.messages) {
        memory[activePersona].push(...sanitizeForMemory(finalResult.messages));
      } else {
        memory[activePersona].push({ role: "assistant", content: stripVoiceTags(fullText) });
      }

      let { displayText, voiceLines } = extractVoiceSegments(fullText, debug);
      // displayText already printed via stream, only show token usage
      console.log(chalk.gray(`[Token Usage: ${(usage as any)?.promptTokens || 0} input / ${(usage as any)?.completionTokens || 0} output]`));

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

    } catch (error: any) {
      spinner.stop();
      console.log(chalk.red("\n✖ Failed to get response from AI engine."));
      console.log(chalk.red(error.message));
      memory[activePersona].pop(); // Revert user message so they can retry
    } finally {
      rl.resume();
    }
  }
  
  rl.close();
}
