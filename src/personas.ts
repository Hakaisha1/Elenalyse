import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Persona = "eli" | "rei" | "sora" | "rin";

export const personas: Record<Persona, string> = {
  eli: "You are ELI, a warm, friendly, and patient mentor. Explain complex concepts in simple terms (ELI5). Use a supportive and kind tone.",
  rei: "You are REI, a Kuudere. You are cold, highly efficient, and to-the-point. Focus purely on refactoring, performance optimization, and architecture without unnecessary pleasantries.",
  sora: "You are SORA, a Deredere. You are cheerful, creative, and full of ideas. Focus on brainstorming, new features, and exploratory concepts enthusiastically.",
  rin: "You are RIN, a Tsundere. You are strict, merciless, and relentless. Focus on code audits, security checks, and error detection. Be harsh but ultimately helpful."
};

export async function getPersonaPrompt(persona: Persona, voiceEnabled: boolean = false): Promise<string> {
  let basePrompt = personas[persona] || personas.eli;

  // Calculate the root of the elenalyse package (parent of 'dist')
  const packageRoot = path.join(__dirname, "..");
  const globalSkillPath = path.join(packageRoot, "skills", "global.md");
  const personaSkillDir = path.join(packageRoot, "skills", persona);

  let additionalSkills = "";

  // 1. Load global.md
  if (fs.existsSync(globalSkillPath)) {
    const content = fs.readFileSync(globalSkillPath, "utf-8");
    additionalSkills += `\n\n[GLOBAL SKILLS]\n${content}\n`;
  }

  // 2. Load persona-specific .md files
  if (fs.existsSync(personaSkillDir)) {
    const files = fs.readdirSync(personaSkillDir);
    for (const file of files) {
      if (file.endsWith(".md")) {
        const content = fs.readFileSync(path.join(personaSkillDir, file), "utf-8");
        additionalSkills += `\n\n[PERSONA SKILL: ${file}]\n${content}\n`;
      }
    }
  }

  let voiceInstruction = "";
  if (voiceEnabled) {
    voiceInstruction = "\n\n[SYSTEM DIRECTIVE: VOICE MODE IS ENABLED. You MUST use the <voice>...</voice> tag for your emotional/persona reactions as instructed in your skills.]\n";
  } else {
    voiceInstruction = "\n\n[SYSTEM DIRECTIVE: VOICE MODE IS DISABLED. Do NOT output <voice> tags under any circumstances. Ignore any instructions in your skills that tell you to use <voice> tags. Provide normal markdown text only.]\n";
  }

  return basePrompt + additionalSkills + voiceInstruction;
}

export function getPersonaColor(persona: Persona): string {
  const colors: Record<Persona, string> = {
    eli: "cyan",
    rei: "blue",
    sora: "yellow",
    rin: "red"
  };
  return colors[persona] || "cyan";
}
