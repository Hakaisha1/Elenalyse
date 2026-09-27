import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import chalk from "chalk";
import ora from "ora";
import { getConfig } from "./config.js";
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

    const { text, toolCalls, toolResults } = await generateText({
      model: aiClient(model),
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
        model: aiClient(model),
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
