import { Command } from "commander";
import chalk from "chalk";
import { handleChat } from "./chat.js";
import { setConfig } from "./config.js";
import { Persona, personas } from "./personas.js";

const program = new Command();

program
  .name("elenalyse")
  .description("Interactive CLI personal developer assistant")
  .version("0.1.0");

program
  .command("chat")
  .description("Chat with the active persona")
  .argument("[message]", "The message to send to the assistant")
  .option("-v, --voice", "Enable TTS voice response")
  .action(async (message, options) => {
    await handleChat(message, options.voice);
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

program.parse();
