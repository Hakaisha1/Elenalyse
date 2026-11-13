import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";

export interface SessionData {
  name: string;
  timestamp: string;
  memory: Record<string, any[]>;
  sessionState: {
    filesTouched: string[];
  };
}

let customSessionsDir: string | null = null;

export function setCustomSessionsDir(dir: string | null) {
  customSessionsDir = dir;
}

export function getSessionsDir(): string {
  return customSessionsDir || path.join(os.homedir(), ".elenalyse", "sessions");
}

export async function saveSession(
  name: string,
  memory: Record<string, any[]>,
  sessionState: { filesTouched: Set<string> | string[] }
): Promise<{ success: boolean; filePath: string; message: string }> {
  const sessionsDir = getSessionsDir();
  await fs.mkdir(sessionsDir, { recursive: true });

  const sanitized = name.replace(/\.json$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_") || `session_${Date.now()}`;
  const filePath = path.join(sessionsDir, `${sanitized}.json`);

  const filesTouched =
    sessionState.filesTouched instanceof Set
      ? [...sessionState.filesTouched]
      : Array.isArray(sessionState.filesTouched)
      ? sessionState.filesTouched
      : [];

  const data: SessionData = {
    name: sanitized,
    timestamp: new Date().toISOString(),
    memory,
    sessionState: { filesTouched },
  };

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  return {
    success: true,
    filePath,
    message: `Session saved as '${sanitized}'`,
  };
}

export async function loadSession(
  name: string
): Promise<{ success: boolean; data?: SessionData; message: string }> {
  const sessionsDir = getSessionsDir();
  const sanitized = name.replace(/\.json$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join(sessionsDir, `${sanitized}.json`);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data: SessionData = JSON.parse(raw);
    return {
      success: true,
      data,
      message: `Session '${sanitized}' loaded successfully.`,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return {
        success: false,
        message: `Session '${sanitized}' not found.`,
      };
    }
    return {
      success: false,
      message: `Failed to load session '${sanitized}': ${error.message}`,
    };
  }
}

export async function listSessions(): Promise<string[]> {
  const sessionsDir = getSessionsDir();
  try {
    const files = await fs.readdir(sessionsDir);
    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -5));
  } catch {
    return [];
  }
}

export function listSessionsSync(): string[] {
  const sessionsDir = getSessionsDir();
  try {
    const files = fsSync.readdirSync(sessionsDir);
    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -5));
  } catch {
    return [];
  }
}
