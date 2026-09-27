import { Command } from "commander";
import chalk from "chalk";

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
  .action((message, options) => {
    console.log(chalk.blue("Elenalyse (ELI):"), "This is a simulated chat response. AI engine not yet connected.");
    if (message) {
      console.log(chalk.gray(`You asked: "${message}"`));
    }
    if (options.voice) {
      console.log(chalk.yellow("(Simulation: Playing TTS audio...)"));
    }
  });

const personaCmd = program
  .command("persona")
  .description("Manage active persona");

personaCmd
  .command("set <name>")
  .description("Set active persona (eli, rei, sora, rin)")
  .action((name) => {
    console.log(chalk.green(`Active persona set to: ${name.toUpperCase()}`));
  });

program.parse();
