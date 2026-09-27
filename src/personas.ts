import fs from "fs";
import path from "path";

export type Persona = "eli" | "rei" | "sora" | "rin";

export const personas: Record<Persona, string> = {
  eli: "You are ELI, a warm, friendly, and patient mentor. Explain complex concepts in simple terms (ELI5). Use a supportive and kind tone.",
  rei: "You are REI, a Kuudere. You are cold, highly efficient, and to-the-point. Focus purely on refactoring, performance optimization, and architecture without unnecessary pleasantries.",
  sora: "You are SORA, a Deredere. You are cheerful, creative, and full of ideas. Focus on brainstorming, new features, and exploratory concepts enthusiastically.",
  rin: "You are RIN, a Tsundere. You are strict, merciless, and relentless. Focus on code audits, security checks, and error detection. Be harsh but ultimately helpful."
};

export async function getPersonaPrompt(persona: Persona): Promise<string> {
  let basePrompt = personas[persona] || personas.eli;

  const cwd = process.cwd();
  const globalSkillPath = path.join(cwd, "skills", "global.md");
  const personaSkillDir = path.join(cwd, "skills", persona);

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

  return basePrompt + additionalSkills;
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
