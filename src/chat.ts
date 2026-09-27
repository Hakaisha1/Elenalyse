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
import { getConfig, setConfig } from "./config.js";
import { getPersonaPrompt, getPersonaColor, PERSONA_SPEAKER_MAP } from "./personas.js";
import { readFileTool, listDirTool, createRunCommandTool } from "./tools.js";
import { ensureEngineDownloaded, ensureEngineRunning } from "./voiceEngine.js";
import { synthesizeSpeech } from "./tts.js";

function extractVoiceSegments(responseText: string): { displayText: string; voiceLines: string[] } {
  const voiceLines: string[] = [];
  const displayText = responseText.replace(/<voice>([\s\S]*?)<\/voice>/g, (_, content) => {
    voiceLines.push(content.trim());
    return ""; // Hide the voice text from the terminal
  });
  return { displayText: displayText.trim(), voiceLines };
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

export async function handleChat(message: string, voiceEnabled: boolean) {
  if (!message) {
    console.log(chalk.red("Error: Message is required."));
    process.exit(1);
  }

  const { activePersona, provider, model } = getConfig();
  const systemPrompt = await getPersonaPrompt(activePersona, voiceEnabled);
  const colorName = getPersonaColor(activePersona) as keyof typeof chalk;
  
  const colorFn = (chalk as any)[colorName] || chalk.white;
  
  const spinner = ora(`Elenalyse (${activePersona.toUpperCase()}) is thinking...`).start();

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
        runCommand: createRunCommandTool(
          () => spinner.stop(),
          () => spinner.start()
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
      let { displayText, voiceLines } = extractVoiceSegments(text);
      if (voiceLines.length > 0) {
        const speakerId = PERSONA_SPEAKER_MAP[activePersona] || 2;
        playVoiceLines(voiceLines, speakerId);
      }
    }
  } catch (error: any) {
    spinner.fail("Failed to get response from AI engine.");
    console.error(chalk.red(error.message));
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

export async function startInteractiveChat(voiceEnabled: boolean) {
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
  
  let handoffPromise: Promise<string> | null = null;
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
        // Asynchronous Background Handoff Synthesis
        const currentHistory = memory[activePersona];
        oldPersonaNameForHandoff = activePersona;

        if (currentHistory.length > 0) {
          handoffPromise = getAiClient(provider, model, config).then(aiModel => {
            const evaluationMessages = [...currentHistory];
            evaluationMessages.push({
              role: "user",
              content: "[System Instruction]: You are a senior developer handing off a shift to a colleague. Read our conversation history above and write a highly concise, purely technical summary of my current situation. What file am I working on? What is the exact bug or feature goal? Do not include greetings or fluff. Use bullet points."
            });
            
            return generateText({
              model: aiModel,
              messages: evaluationMessages
            }).then(res => res.text);
          }).catch(e => "Error: Failed to synthesize context. " + e.message);
        }

        activePersona = newPersona as any;
        config.activePersona = activePersona;
        setConfig(config);

        console.log(chalk.gray(`[ℹ] Persona changed to ${activePersona.toUpperCase()} (Synthesizing context in background...)`));
      } else if (newPersona === activePersona) {
        console.log(chalk.gray(`[ℹ] Persona is already ${activePersona.toUpperCase()}`));
      } else {
        console.log(chalk.red("Invalid persona! Use: eli, rei, sora, rin"));
      }
      continue;
    }

    let finalInput = input;
    if (handoffPromise) {
      const spinner = ora(`Waiting for context handoff to complete...`).start();
      const handoffSummary = (await handoffPromise) as string;
      spinner.stop();
      handoffPromise = null;
      
      if (handoffSummary && !handoffSummary.startsWith("Error")) {
        const pendingHandoffNote = `[SYSTEM HANDOFF NOTE: You have just replaced ${oldPersonaNameForHandoff.toUpperCase()}. The user's current working context is as follows:\n\n${handoffSummary}\n\nPlease smoothly resume assisting the user based on this context without explicitly mentioning this handoff note.]`;
        finalInput = `${pendingHandoffNote}\n\nUser Message: ${input}`;
      }
    }

    memory[activePersona].push({ role: "user", content: finalInput });

    const colorName = getPersonaColor(activePersona) as keyof typeof chalk;
    const colorFn = (chalk as any)[colorName] || chalk.white;
    const spinner = ora(`Elenalyse (${activePersona.toUpperCase()}) is thinking...`).start();

    // Pause rl to avoid stdin conflicts with runCommandTool
    rl.pause();

    try {
      const aiModel = await getAiClient(provider, model, config);

      const { text, toolCalls, toolResults, usage, response } = await generateText({
        model: aiModel,
        system: await getPersonaPrompt(activePersona, voiceEnabled),
        messages: memory[activePersona],
        tools: {
          readFile: readFileTool,
          listDir: listDirTool,
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

      let finalText = text;
      
      // Fallback for LLMs that don't support native maxSteps
      if (!text && toolCalls && toolCalls.length > 0 && toolResults && toolResults.length > 0) {
        const toolSpinner = ora(`Evaluating ${toolCalls[0].toolName} results...`).start();
        const evaluationMessages = [...memory[activePersona]];
        
        // Push the manual tool call and result to history so it isn't lost
        evaluationMessages.push({ role: "assistant", content: "", toolCalls: toolCalls as any });
        evaluationMessages.push({ role: "tool", content: toolResults as any });
        
        evaluationMessages.push({
          role: "user",
          content: `[System: You called the tool "${toolCalls[0].toolName}" and received this result:\n${JSON.stringify((toolResults[0] as any).result || (toolResults[0] as any).output || "Success", null, 2)}\n\nPlease provide your final answer to the user based on this data. Do not output JSON, speak naturally.]`
        });

        const secondRun = await generateText({
          model: aiModel,
          system: await getPersonaPrompt(activePersona, voiceEnabled),
          messages: evaluationMessages,
        });
        toolSpinner.stop();
        finalText = secondRun.text;
        
        if (secondRun.usage) {
          (usage as any).promptTokens += (secondRun.usage as any).promptTokens || 0;
          (usage as any).completionTokens += (secondRun.usage as any).completionTokens || 0;
        }

        // Push manual history
        memory[activePersona].push({ role: "assistant", content: "", toolCalls: toolCalls as any });
        memory[activePersona].push({ role: "tool", content: toolResults as any });
        memory[activePersona].push({ role: "assistant", content: finalText });
      } else {
        // AI SDK handled it natively with maxSteps, push the full response history
        if (response && response.messages) {
          memory[activePersona].push(...response.messages);
        } else {
          memory[activePersona].push({ role: "assistant", content: finalText });
        }
      }

      let { displayText, voiceLines } = extractVoiceSegments(finalText);
      console.log(colorFn(`🧊 Elenalyse (${activePersona.toUpperCase()}): `) + displayText);
      console.log(chalk.gray(`[Token Usage: ${(usage as any).promptTokens || 0} input / ${(usage as any).completionTokens || 0} output]\n`));

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
