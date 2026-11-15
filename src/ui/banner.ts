import chalk from "chalk";
import { Persona } from "../personas.js";
import { MemoryMode, MEMORY_LIMITS } from "../chat.js";

export interface BannerOptions {
  persona: Persona;
  provider: string;
  model: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  memoryMode: MemoryMode;
  voiceEnabled: boolean;
}

export const PERSONA_ARCHETYPES: Record<
  Persona,
  { title: string; subtitle: string }
> = {
  eli: { title: "ELI", subtitle: "Warm Mentor" },
  rei: { title: "REI", subtitle: "Kuudere Architect" },
  sora: { title: "SORA", subtitle: "Deredere Creative" },
  rin: { title: "RIN", subtitle: "Tsundere Auditor" },
};

export function renderWelcomeBanner(options: BannerOptions): string {
  const {
    persona,
    provider,
    model,
    fallbackProvider,
    fallbackModel,
    memoryMode,
    voiceEnabled,
  } = options;
  const pInfo = PERSONA_ARCHETYPES[persona] || PERSONA_ARCHETYPES.eli;

  const width = 64;
  const line = "─".repeat(width - 2);

  const personaColor =
    persona === "eli"
      ? chalk.cyan
      : persona === "rei"
      ? chalk.blue
      : persona === "sora"
      ? chalk.yellow
      : chalk.red;

  const memoryLimit = MEMORY_LIMITS[memoryMode] ?? 40;
  const fallbackStr = fallbackProvider
    ? `${fallbackProvider}${fallbackModel ? ` (${fallbackModel})` : ""}`
    : "None";
  const voiceStr = voiceEnabled ? "ON (VOICEVOX Engine)" : "OFF (Text Only)";

  const pad = (text: string, rawLen: number) => {
    const spaceCount = Math.max(0, width - 4 - rawLen);
    return text + " ".repeat(spaceCount);
  };

  const titleRaw = "ELENALYSE  v1.0.1";
  const titlePadSpaces = Math.max(
    0,
    Math.floor((width - 2 - titleRaw.length) / 2)
  );
  const centeredTitle =
    " ".repeat(titlePadSpaces) +
    titleRaw +
    " ".repeat(width - 2 - titleRaw.length - titlePadSpaces);

  const personaLabel = `Persona  : ${pInfo.title.toUpperCase()} (${pInfo.subtitle})`;
  const providerLabel = `Provider : ${provider}`;
  const modelLabel = `Model    : ${model}`;
  const fallbackLabel = `Fallback : ${fallbackStr}`;
  const memoryLabel = `Memory   : ${memoryMode} (${memoryLimit} msgs)`;
  const voiceLabel = `Voice    : ${voiceStr}`;
  const tipLabel = "Type /help for commands • Type / for autocomplete dropdown";

  const bannerLines = [
    personaColor(`╭${line}╮`),
    personaColor(`│${chalk.bold.magenta(centeredTitle)}│`),
    personaColor(`├${line}┤`),
    personaColor(`│ `) +
      pad(
        chalk.bold(`Persona  : `) +
          personaColor(
            `${pInfo.title.toUpperCase()} (${pInfo.subtitle})`
          ),
        personaLabel.length
      ) +
      personaColor(` │`),
    personaColor(`│ `) +
      pad(chalk.bold(`Provider : `) + chalk.white(provider), providerLabel.length) +
      personaColor(` │`),
    personaColor(`│ `) +
      pad(chalk.bold(`Model    : `) + chalk.white(model), modelLabel.length) +
      personaColor(` │`),
    personaColor(`│ `) +
      pad(
        chalk.bold(`Fallback : `) +
          (fallbackProvider
            ? chalk.green(fallbackStr)
            : chalk.gray(fallbackStr)),
        fallbackLabel.length
      ) +
      personaColor(` │`),
    personaColor(`│ `) +
      pad(
        chalk.bold(`Memory   : `) +
          chalk.cyan(`${memoryMode} (${memoryLimit} msgs)`),
        memoryLabel.length
      ) +
      personaColor(` │`),
    personaColor(`│ `) +
      pad(
        chalk.bold(`Voice    : `) +
          (voiceEnabled ? chalk.green(voiceStr) : chalk.gray(voiceStr)),
        voiceLabel.length
      ) +
      personaColor(` │`),
    personaColor(`├${line}┤`),
    personaColor(`│ `) +
      pad(
        chalk.gray(`Type `) +
          chalk.cyan(`/help`) +
          chalk.gray(` for commands • Type `) +
          chalk.cyan(`/`) +
          chalk.gray(` for autocomplete dropdown`),
        tipLabel.length
      ) +
      personaColor(` │`),
    personaColor(`╰${line}╯`),
  ];

  return bannerLines.join("\n");
}

export function printWelcomeBanner(options: BannerOptions): void {
  console.clear();
  console.log(renderWelcomeBanner(options));
  console.log("");
}

export interface SettingsBoxOptions {
  memoryMode: string;
  maxSteps: number;
  provider: string;
  model: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  voiceEnabled: boolean;
}

export function renderSettingsBox(options: SettingsBoxOptions): string {
  const {
    memoryMode,
    maxSteps,
    provider,
    model,
    fallbackProvider,
    fallbackModel,
    voiceEnabled,
  } = options;

  const width = 64;
  const line = "─".repeat(width - 2);

  const memLimit = (MEMORY_LIMITS as any)[memoryMode] ?? 40;
  const memStr = `${memoryMode} (${memLimit} msgs limit)`;
  const stepsStr = `${maxSteps} steps`;
  const fbStr = fallbackProvider
    ? `${fallbackProvider}${fallbackModel ? ` (${fallbackModel})` : ""}`
    : "None";
  const voiceStr = voiceEnabled ? "ON (VOICEVOX Engine)" : "OFF (Text Only)";

  const pad = (text: string, rawLen: number) => {
    const spaceCount = Math.max(0, width - 4 - rawLen);
    return text + " ".repeat(spaceCount);
  };

  const titleRaw = "ELENALYSE  SETTINGS";
  const titlePadSpaces = Math.max(
    0,
    Math.floor((width - 2 - titleRaw.length) / 2)
  );
  const centeredTitle =
    " ".repeat(titlePadSpaces) +
    titleRaw +
    " ".repeat(Math.max(0, width - 2 - titleRaw.length - titlePadSpaces));

  const memLabel = `Memory Mode  : ${memStr}`;
  const stepsLabel = `Max Steps    : ${stepsStr}`;
  const provLabel = `Provider     : ${provider}`;
  const modelLabel = `Model        : ${model}`;
  const fbLabel = `Fallback     : ${fbStr}`;
  const voiceLabel = `Voice Engine : ${voiceStr}`;
  const hintLabel = "Use /setting [memory|steps|voice] <value> to modify";

  const boxLines = [
    chalk.cyan(`╭${line}╮`),
    chalk.cyan(`│${chalk.bold.yellow(centeredTitle)}│`),
    chalk.cyan(`├${line}┤`),
    chalk.cyan(`│ `) + pad(chalk.bold(`Memory Mode  : `) + chalk.white(memStr), memLabel.length) + chalk.cyan(` │`),
    chalk.cyan(`│ `) + pad(chalk.bold(`Max Steps    : `) + chalk.white(stepsStr), stepsLabel.length) + chalk.cyan(` │`),
    chalk.cyan(`│ `) + pad(chalk.bold(`Provider     : `) + chalk.white(provider), provLabel.length) + chalk.cyan(` │`),
    chalk.cyan(`│ `) + pad(chalk.bold(`Model        : `) + chalk.white(model), modelLabel.length) + chalk.cyan(` │`),
    chalk.cyan(`│ `) + pad(chalk.bold(`Fallback     : `) + chalk.white(fbStr), fbLabel.length) + chalk.cyan(` │`),
    chalk.cyan(`│ `) + pad(chalk.bold(`Voice Engine : `) + chalk.white(voiceStr), voiceLabel.length) + chalk.cyan(` │`),
    chalk.cyan(`├${line}┤`),
    chalk.cyan(`│ `) + pad(chalk.gray(hintLabel), hintLabel.length) + chalk.cyan(` │`),
    chalk.cyan(`╰${line}╯`),
  ];

  return boxLines.join("\n");
}
