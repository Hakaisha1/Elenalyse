import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import chalk from "chalk";
import ora from "ora";
import { getConfig } from "./config.js";
import { getPersonaPrompt, getPersonaColor } from "./personas.js";

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

  let aiClient;

  try {
    if (provider === "openrouter") {
      const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY environment variable is not set.");
      aiClient = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
    } else if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set.");
      aiClient = createOpenAI({ apiKey });
    } else if (provider === "local") {
      // Local provider assumes an OpenAI-compatible endpoint like LM Studio or Ollama
      aiClient = createOpenAI({ baseURL: "http://localhost:11434/v1", apiKey: "local" });
    } else if (provider === "google") {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set.");
      aiClient = createGoogleGenerativeAI({ apiKey });
    } else {
      throw new Error(`Unknown AI provider configured: ${provider}`);
    }

    const { text } = await generateText({
      model: aiClient(model),
      system: systemPrompt,
      prompt: message,
    });

    spinner.stop();
    console.log(colorFn(`Elenalyse (${activePersona.toUpperCase()}): `) + text);

    if (voiceEnabled) {
      console.log(chalk.magenta("\n[TTS Feature is currently mocked and not yet implemented]"));
    }
  } catch (error: any) {
    spinner.fail("Failed to get response from AI engine.");
    console.error(chalk.red(error.message));
  }
}
