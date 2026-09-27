import { generateText } from "ai";
import * as readline from "readline/promises";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import chalk from "chalk";
import ora from "ora";
import { getConfig, setConfig } from "./config.js";
import { getPersonaPrompt, getPersonaColor } from "./personas.js";
import { readFileTool, listDirTool, createRunCommandTool } from "./tools.js";

export async function handleChat(message: string, voiceEnabled: boolean) {
  if (!message) {
    console.log(chalk.red("Error: Message is required."));
    process.exit(1);
  }

  const { activePersona, provider, model } = getConfig();
  const systemPrompt = getPersonaPrompt(activePersona);
  const colorName = getPersonaColor(activePersona) as keyof typeof chalk;
  
  const colorFn = (chalk as any)[colorName] || chalk.white;
  
  const spinner = ora(`Elenalyse (${activePersona.toUpperCase()}) is thinking...`).start();

  try {
    const config = getConfig();
    const aiClientFactory = await getAiClient(provider, model, config);

    const { text, toolCalls, toolResults } = await generateText({
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
      console.log(colorFn(`Elenalyse (${activePersona.toUpperCase()}): `) + secondRun.text);
    } else {
      console.log(colorFn(`Elenalyse (${activePersona.toUpperCase()}): `) + text);
    }

    if (voiceEnabled) {
      console.log(chalk.magenta("\n[TTS Feature is currently mocked and not yet implemented]"));
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
    console.log(chalk.cyan("Ketik pesan Anda di bawah ini. Ketik '/help' untuk melihat daftar perintah."));
    console.log(chalk.magenta("===================================================\n"));
  };

  printWelcome();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let chatHistory: any[] = [];

  const updateSystemPrompt = () => {
    return { role: "system" as const, content: getPersonaPrompt(activePersona) };
  };

  while (true) {
    const input = await rl.question(chalk.green("👤 Anda ❯ "));
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
      console.log(chalk.cyan("\nDaftar Perintah Tersedia:"));
      console.log(chalk.cyan("  /help           : Menampilkan menu bantuan ini"));
      console.log(chalk.cyan("  /persona <nama> : Mengganti persona (eli/rei/sora/rin)"));
      console.log(chalk.cyan("  /model <nama>   : Mengganti model (contoh: gemini-3.5-flash-lite)"));
      console.log(chalk.cyan("  /provider <nama>: Mengganti provider (google/openai/openrouter/local)"));
      console.log(chalk.cyan("  /api <provider> <key> : Menyimpan API Key (contoh: /api google AIza...)"));
      console.log(chalk.cyan("  /clear          : Membersihkan layar"));
      console.log(chalk.cyan("  /exit           : Keluar dari aplikasi\n"));
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
        console.log(chalk.gray(`[ℹ] API Key untuk ${prov} telah disimpan.`));
      } else {
        console.log(chalk.red("Format salah! Gunakan: /api <provider> <key>"));
      }
      continue;
    }

    if (input.startsWith("/model ")) {
      const newModel = input.split(" ")[1];
      if (newModel) {
        model = newModel;
        config.model = model;
        setConfig(config);
        console.log(chalk.gray(`[ℹ] Model diubah menjadi ${model}`));
      }
      continue;
    }

    if (input.startsWith("/provider ")) {
      const newProvider = input.split(" ")[1];
      if (["google", "openai", "openrouter", "local"].includes(newProvider?.toLowerCase())) {
        provider = newProvider.toLowerCase() as any;
        config.provider = provider;
        setConfig(config);
        console.log(chalk.gray(`[ℹ] Provider diubah menjadi ${provider}`));
      } else {
        console.log(chalk.red("Provider tidak valid! Gunakan: google, openai, openrouter, local"));
      }
      continue;
    }

    if (input.startsWith("/persona ")) {
      const newPersona = input.split(" ")[1];
      if (["eli", "rei", "sora", "rin"].includes(newPersona?.toLowerCase())) {
        activePersona = newPersona.toLowerCase() as any;
        config.activePersona = activePersona;
        setConfig(config);
        console.log(chalk.gray(`[ℹ] Persona diubah menjadi ${activePersona.toUpperCase()}`));
      } else {
        console.log(chalk.red("Persona tidak valid! Gunakan: eli, rei, sora, rin"));
      }
      continue;
    }

    if (chatHistory.length === 0) {
      chatHistory.push(updateSystemPrompt());
    } else {
      chatHistory[0] = updateSystemPrompt();
    }

    chatHistory.push({ role: "user", content: input });

    const colorName = getPersonaColor(activePersona) as keyof typeof chalk;
    const colorFn = (chalk as any)[colorName] || chalk.white;
    const spinner = ora(`Elenalyse (${activePersona.toUpperCase()}) is thinking...`).start();

    // Pause rl to avoid stdin conflicts with runCommandTool
    rl.pause();

    try {
      const aiModel = await getAiClient(provider, model, config);

      const { text, toolCalls, toolResults } = await generateText({
        model: aiModel,
        messages: chatHistory,
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

      let finalText = text;
      
      if (!text && toolCalls && toolCalls.length > 0 && toolResults && toolResults.length > 0) {
        const toolSpinner = ora(`Evaluating ${toolCalls[0].toolName} results...`).start();
        const evaluationMessages = [...chatHistory];
        
        evaluationMessages.push({
          role: "user",
          content: `[System: You called the tool "${toolCalls[0].toolName}" and received this result:\n${JSON.stringify((toolResults[0] as any).result || (toolResults[0] as any).output || "Success", null, 2)}\n\nPlease provide your final answer to the user based on this data. Do not output JSON, speak naturally.]`
        });

        const secondRun = await generateText({
          model: aiModel,
          messages: evaluationMessages,
        });
        toolSpinner.stop();
        finalText = secondRun.text;
      }

      console.log(colorFn(`🧊 Elenalyse (${activePersona.toUpperCase()}): `) + finalText + "\n");
      chatHistory.push({ role: "assistant", content: finalText });

    } catch (error: any) {
      spinner.stop();
      console.log(chalk.red("\n✖ Failed to get response dari mesin AI."));
      console.log(chalk.red(error.message));
      chatHistory.pop(); // Revert user message so they can retry
    } finally {
      rl.resume();
    }
  }
  
  rl.close();
}
