import fs from "fs";
import path from "path";
import os from "os";
import { Persona } from "./personas.js";

const configPath = path.join(os.homedir(), ".elenalyserc.json");

export type Provider = "openrouter" | "openai" | "local" | "google";
export type MemoryMode = "default" | "amnesia" | "focus";

export interface Config {
  activePersona: Persona;
  provider: Provider;
  model: string;
  fallbackProvider?: Provider;
  fallbackModel?: string;
  apiKeys?: Record<string, string>;
  memoryMode?: MemoryMode;
  maxSteps?: number;
  voiceEnabled?: boolean;
}

export function isFailoverError(error: any): boolean {
  if (!error) return false;
  const status = error.status || error.statusCode || error.response?.status;
  if (status === 429 || status === 503 || status === 502 || status === 504) return true;

  const msg = String(error.message || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("503") ||
    msg.includes("overloaded") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("timed out") ||
    msg.includes("timeout")
  );
}

export async function executeWithFailover<T>(
  action: (provider: Provider, model: string) => Promise<T>,
  primaryProvider: Provider,
  primaryModel: string,
  fallbackProvider?: Provider,
  fallbackModel?: string,
  onFailover?: (fallbackProvider: Provider, error: any) => void
): Promise<{ result: T; usedProvider: Provider; usedModel: string }> {
  try {
    const result = await action(primaryProvider, primaryModel);
    return { result, usedProvider: primaryProvider, usedModel: primaryModel };
  } catch (error: any) {
    if (fallbackProvider && fallbackProvider !== primaryProvider && isFailoverError(error)) {
      const fbModel = fallbackModel || primaryModel;
      if (onFailover) {
        onFailover(fallbackProvider, error);
      }
      const result = await action(fallbackProvider, fbModel);
      return { result, usedProvider: fallbackProvider, usedModel: fbModel };
    }
    throw error;
  }
}

const defaultConfig: Config = {
  activePersona: "eli",
  provider: "openrouter",
  model: "openrouter/free",
  memoryMode: "default",
  maxSteps: 25,
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
