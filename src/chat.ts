import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import chalk from "chalk";
import ora from "ora";
import { getConfig } from "./config.js";
import { getPersonaPrompt, getPersonaColor } from "./personas.js";

export async function handleChat(message: string, voiceEnabled: boolean) {
  // Check for OpenRouter key first, fallback to OpenAI key for compatibility
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log(chalk.red("Error: OPENROUTER_API_KEY environment variable is not set."));
    console.log(chalk.yellow("Please set it by running: export OPENROUTER_API_KEY='sk-or-v1-...'"));
    process.exit(1);
  }

  if (!message) {
    console.log(chalk.red("Error: Message is required."));
    process.exit(1);
  }

  const { activePersona } = getConfig();
  const systemPrompt = getPersonaPrompt(activePersona);
  const colorName = getPersonaColor(activePersona) as keyof typeof chalk;
  
  const colorFn = (chalk as any)[colorName] || chalk.white;
  
  const spinner = ora(`Elenalyse (${activePersona.toUpperCase()}) is thinking...`).start();

  // Configure Vercel AI SDK to use OpenRouter instead of default OpenAI
  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: apiKey,
  });

  try {
    const { text } = await generateText({
      // We use a working free model provided by OpenRouter
      model: openrouter("openrouter/free"),
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
