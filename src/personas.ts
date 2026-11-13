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

export function getProjectContext(rootDir: string = process.cwd()): string {
  const elenalyseMdPath = path.join(rootDir, "ELENALYSE.md");
  try {
    if (fs.existsSync(elenalyseMdPath)) {
      const content = fs.readFileSync(elenalyseMdPath, "utf-8");
      const capped = content.slice(0, 2048);
      return `[PROJECT CONTEXT (from ELENALYSE.md)]\n${capped}`;
    }
  } catch {}

  const pkgJsonPath = path.join(rootDir, "package.json");
  try {
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      const name = pkg.name || "unnamed";
      const desc = pkg.description ? ` - ${pkg.description}` : "";
      const scripts = pkg.scripts ? JSON.stringify(pkg.scripts, null, 2) : "{}";
      return `[PROJECT CONTEXT (from package.json)]\nProject: ${name}${desc}\nScripts:\n${scripts}`;
    }
  } catch {}

  return "";
}

export async function getPersonaPrompt(persona: Persona, voiceEnabled: boolean = false): Promise<string> {
  let basePrompt = personas[persona] || personas.eli;
  basePrompt += "\n\n[SYSTEM DIRECTIVE: TOOL USAGE]\nIf the user asks you to create, write, or generate a file, you MUST ALWAYS use the `writeFile` tool to do it instead of outputting markdown code blocks in chat. If the user asks you to edit or modify a file, you MUST ALWAYS use the `editFile` tool. Outputting code blocks without using these tools when explicitly asked to write a file is STRICTLY PROHIBITED.";
  basePrompt += "\n\n[AUTONOMOUS ANALYSIS PROTOCOL]\nWhen asked to analyze, audit, inspect, review, or search the codebase: You MUST execute the necessary tools immediately. DO NOT tell the user to wait or ask what to do next without performing the work. Perform all necessary file inspections autonomously across multiple steps. Only provide your final comprehensive report once the inspection is complete.";

  const projectContext = getProjectContext();
  if (projectContext) {
    basePrompt += `\n\n${projectContext}`;
  }

  // Calculate the root of the elenalyse package (parent of 'dist')
  const packageRoot = path.join(__dirname, "..");
  const globalSkillPath = path.join(packageRoot, "skills", "global.md");
  const personaSkillDir = path.join(packageRoot, "skills", persona);

  let additionalSkills = "";

  // 1. Load global.md
  if (fs.existsSync(globalSkillPath)) {
    let content = fs.readFileSync(globalSkillPath, "utf-8");
    if (!voiceEnabled) {
      content = content.replace(/<!--\s*voice:start\s*-->[\s\S]*?<!--\s*voice:end\s*-->/gi, "");
    }
    additionalSkills += `\n\n[GLOBAL SKILLS]\n${content}\n`;
  }

  // 2. Load persona-specific .md files
  if (fs.existsSync(personaSkillDir)) {
    const files = fs.readdirSync(personaSkillDir);
    for (const file of files) {
      if (file.endsWith(".md") && file !== "voice.md") {
        let content = fs.readFileSync(path.join(personaSkillDir, file), "utf-8");
        if (!voiceEnabled) {
          // Remove <!-- voice:start --> to <!-- voice:end --> blocks and their contents
          content = content.replace(/<!--\s*voice:start\s*-->[\s\S]*?<!--\s*voice:end\s*-->/gi, "");
        }
        additionalSkills += `\n\n[PERSONA SKILL: ${file}]\n${content}\n`;
      }
    }
  }

  let voiceInstruction = "";
  if (voiceEnabled) {
    voiceInstruction = "\n\n[SYSTEM DIRECTIVE: VOICE MODE IS ENABLED. You MUST use the <voice>...</voice> tag for your emotional/persona reactions. CRITICAL: The text inside <voice> tags MUST be written entirely in Japanese (Kanji/Hiragana/Katakana) because it is fed to a Japanese TTS engine. The content inside the voice tags will be hidden from the UI, so ensure any critical technical information or English explanations are placed OUTSIDE the voice tags in standard markdown.]\n";
    
    const voiceSkillPath = path.join(personaSkillDir, "voice.md");
    if (fs.existsSync(voiceSkillPath)) {
      const voiceContent = fs.readFileSync(voiceSkillPath, "utf-8");
      voiceInstruction += `\n[VOICE GUIDELINES]\n${voiceContent}\n`;
    }
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

// Map each persona to a specific VOICEVOX Speaker ID.
// You can discover these IDs by hitting GET http://127.0.0.1:50021/speakers once the engine runs.
export const PERSONA_SPEAKER_MAP: Record<Persona, number> = {
  eli: 2,   // Shikoku Metan (Normal) - Friendly, warm, patient assistant.
  rei: 14,  // Kasukabe Tsumugi (Normal) - Calm, cold, highly efficient (Kuudere).
  sora: 29,  // No.7 - Cheerful, energetic, creative (Deredere).
  rin: 7,   // Zundamon (Tsundere) - Strict, harsh, but helpful (Tsundere).
};
