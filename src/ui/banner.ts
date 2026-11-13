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
  { title: string; subtitle: string; icon: string }
> = {
  eli: { title: "ELI", subtitle: "Warm Mentor", icon: "🌱" },
  rei: { title: "REI", subtitle: "Kuudere Architect", icon: "❄️" },
  sora: { title: "SORA", subtitle: "Deredere Creative", icon: "☀️" },
  rin: { title: "RIN", subtitle: "Tsundere Auditor", icon: "⚡" },
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

  const titleRaw = "✨ E L E N A L Y S E  v1.0.0 ✨";
  const titlePadSpaces = Math.max(
    0,
    Math.floor((width - 2 - titleRaw.length) / 2)
  );
  const centeredTitle =
    " ".repeat(titlePadSpaces) +
    titleRaw +
    " ".repeat(width - 2 - titleRaw.length - titlePadSpaces);

  const personaLabel = `Persona  : ${pInfo.icon} ${pInfo.title.toUpperCase()} (${pInfo.subtitle})`;
  const providerLabel = `Provider : ${provider}`;
  const modelLabel = `Model    : ${model}`;
  const fallbackLabel = `Fallback : ${fallbackStr}`;
  const memoryLabel = `Memory   : ${memoryMode} (${memoryLimit} msgs)`;
  const voiceLabel = `Voice    : ${voiceStr}`;
  const tipLabel = "💡 Type /help for commands • Type / for autocomplete dropdown";

  const bannerLines = [
    personaColor(`╭${line}╮`),
    personaColor(`│${chalk.bold.magenta(centeredTitle)}│`),
    personaColor(`├${line}┤`),
    personaColor(`│ `) +
      pad(
        chalk.bold(`Persona  : `) +
          personaColor(
            `${pInfo.icon} ${pInfo.title.toUpperCase()} (${pInfo.subtitle})`
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
        chalk.gray(`💡 Type `) +
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
