import fs from "fs";
import path from "path";
import os from "os";
import { Persona } from "./personas.js";

const configPath = path.join(os.homedir(), ".elenalyserc.json");

export type Provider = "openrouter" | "openai" | "local" | "google";

export interface Config {
  activePersona: Persona;
  provider: Provider;
  model: string;
}

const defaultConfig: Config = {
  activePersona: "eli",
  provider: "openrouter",
  model: "openrouter/free"
};

export function getConfig(): Config {
  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }
  try {
    const data = fs.readFileSync(configPath, "utf-8");
    return { ...defaultConfig, ...JSON.parse(data) };
  } catch {
    return defaultConfig;
  }
}

export function setConfig(newConfig: Partial<Config>) {
  const current = getConfig();
  const updated = { ...current, ...newConfig };
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf-8");
}
