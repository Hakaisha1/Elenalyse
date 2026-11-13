import { Command } from "commander";
import chalk from "chalk";
import { handleChat, startInteractiveChat, MemoryMode, MEMORY_LIMITS, trimMemory } from "./chat.js";
import { setConfig, Provider, Config } from "./config.js";
import { Persona, personas } from "./personas.js";

export { MemoryMode, MEMORY_LIMITS, trimMemory };

const program = new Command();

program
  .name("elenalyse")
  .description("Interactive CLI personal developer assistant")
  .version("0.1.0");

program
  .command("start")
  .description("Start the interactive Elenalyse REPL chat")
  .option("-v, --voice", "Enable TTS voice response")
  .option("-d, --debug", "Show hidden voice tags in CLI for debugging")
  .option("--amnesia", "Trim memory to 10 messages for low-token models")
  .option("--focus", "Allow up to 100 messages for extended context")
  .action(async (options) => {
    let memoryMode: MemoryMode = "default";
    if (options.amnesia) {
      memoryMode = "amnesia";
    } else if (options.focus) {
      memoryMode = "focus";
    }
    await startInteractiveChat(options.voice, options.debug, memoryMode);
  });

program
  .command("chat")
  .description("Send a single message to the active persona")
  .argument("[message]", "The message to send to the assistant")
  .option("-v, --voice", "Enable TTS voice response")
  .option("-d, --debug", "Show hidden voice tags in CLI for debugging")
  .option("--amnesia", "Trim memory to 10 messages for low-token models")
  .option("--focus", "Allow up to 100 messages for extended context")
  .action(async (message, options) => {
    let memoryMode: MemoryMode = "default";
    if (options.amnesia) {
      memoryMode = "amnesia";
    } else if (options.focus) {
      memoryMode = "focus";
    }
    if (message) {
      await handleChat(message, options.voice, options.debug);
    } else {
      await startInteractiveChat(options.voice, options.debug, memoryMode);
    }
  });

const personaCmd = program
  .command("persona")
  .description("Manage active persona");

personaCmd
  .command("set <name>")
  .description("Set active persona (eli, rei, sora, rin)")
  .action((name: string) => {
    const lowerName = name.toLowerCase() as Persona;
    if (!personas[lowerName]) {
      console.log(chalk.red(`Error: Unknown persona '${name}'. Available personas: eli, rei, sora, rin.`));
      process.exit(1);
    }
    setConfig({ activePersona: lowerName });
    console.log(chalk.green(`Active persona set to: ${lowerName.toUpperCase()}`));
  });

const configCmd = program
  .command("config")
  .description("Manage CLI configuration (provider, model)");

configCmd
  .command("provider <name>")
  .description("Set AI provider (openrouter, openai, local, google)")
  .action((name: string) => {
    const p = name.toLowerCase() as Provider;
    if (!["openrouter", "openai", "local", "google"].includes(p)) {
      console.log(chalk.red(`Error: Unknown provider '${p}'. Available: openrouter, openai, local, google.`));
      process.exit(1);
    }
    setConfig({ provider: p });
    console.log(chalk.green(`AI provider set to: ${p}`));
  });

configCmd
  .command("fallback <name> [model]")
  .description("Set fallback AI provider and optional model for failover")
  .action((name: string, modelName?: string) => {
    const p = name.toLowerCase() as Provider;
    if (!["openrouter", "openai", "local", "google"].includes(p)) {
      console.log(chalk.red(`Error: Unknown fallback provider '${p}'. Available: openrouter, openai, local, google.`));
      process.exit(1);
    }
    const update: Partial<Config> = { fallbackProvider: p };
    if (modelName) update.fallbackModel = modelName;
    setConfig(update);
    console.log(chalk.green(`Fallback AI provider set to: ${p}${modelName ? ` (${modelName})` : ""}`));
  });

configCmd
  .command("model <name>")
  .description("Set AI model slug (e.g. gpt-4o-mini, llama3)")
  .action((name: string) => {
    setConfig({ model: name });
    console.log(chalk.green(`AI model set to: ${name}`));
  });

program.parse();
