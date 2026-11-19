import { spawn, ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { getGlobalBroadcaster } from "./bridge/AvatarEventBroadcaster.js";
import { syncAvatarPersona } from "./runtime.js";
import { DEFAULT_BRIDGE_PORT } from "./types.js";
import { getConfig } from "../config.js";

let activeCompanionProcess: ChildProcess | null = null;

export interface LaunchDesktopOptions {
  persona?: string;
  mode?: "dev" | "tauri";
}

export interface LaunchResult {
  spawned: boolean;
  pid?: number;
  message: string;
}

export interface LiveStatusSummary {
  bridgeOnline: boolean;
  port: number;
  connectedClients: number;
  activePersona: string;
  activeModel: string;
}

/**
 * Access the project root directory from module location.
 */
function getProjectRoot(): string {
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    // src/avatar/desktopLauncher.ts -> ../../
    return path.resolve(path.dirname(currentFilePath), "..", "..");
  } catch {
    return process.cwd();
  }
}

/**
 * Launch the desktop companion application in the background detached mode.
 * Decoupled from the Node CLI lifecycle via .unref().
 */
export function launchDesktopCompanion(options?: LaunchDesktopOptions): LaunchResult {
  if (activeCompanionProcess && !activeCompanionProcess.killed) {
    return {
      spawned: false,
      pid: activeCompanionProcess.pid,
      message: "Desktop companion is already running.",
    };
  }

  const persona = options?.persona;
  if (persona) {
    syncAvatarPersona(persona);
  }

  const mode = options?.mode ?? "dev";
  const scriptName = mode === "tauri" ? "desktop:tauri" : "desktop:dev";
  const projectRoot = getProjectRoot();

  try {
    const isWin = process.platform === "win32";
    const npmCmd = isWin ? "npm.cmd" : "npm";

    const child = spawn(npmCmd, ["run", scriptName], {
      cwd: projectRoot,
      detached: true,
      stdio: "ignore",
      shell: isWin,
    });

    child.unref();
    activeCompanionProcess = child;

    return {
      spawned: true,
      pid: child.pid,
      message: `Desktop companion (${scriptName}) launched in background.`,
    };
  } catch (err: any) {
    return {
      spawned: false,
      message: `Failed to launch desktop companion: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Stop the background desktop companion process if currently running.
 */
export function stopDesktopCompanion(): boolean {
  if (!activeCompanionProcess || !activeCompanionProcess.pid) {
    return false;
  }

  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", activeCompanionProcess.pid.toString(), "/f", "/t"], {
        stdio: "ignore",
      });
    } else {
      activeCompanionProcess.kill();
    }
  } catch {
    // Ignore errors during termination
  }

  activeCompanionProcess = null;
  return true;
}

/**
 * Resolve the exact 3D VRM model filename for a given persona.
 */
export function resolveModelFilename(persona: string): string {
  const p = persona.toLowerCase();
  if (p === "rei" || p === "rin") {
    return "REI_Model.vrm";
  }
  return "ELI_Model.vrm";
}

/**
 * Retrieve comprehensive status summary of the live 3D bridge and active model.
 */
export function getLiveStatusSummary(): LiveStatusSummary {
  const broadcaster = getGlobalBroadcaster();
  const config = getConfig();

  const activePersona = (
    config.activePersona ||
    broadcaster.getCurrentPayload().persona ||
    "eli"
  ).toLowerCase();

  const activeModel = resolveModelFilename(activePersona);

  return {
    bridgeOnline: broadcaster.isListening,
    port: broadcaster.port || DEFAULT_BRIDGE_PORT,
    connectedClients: broadcaster.connectedClientsCount,
    activePersona,
    activeModel,
  };
}

/**
 * Render a sleek, formatted box summarizing Live 3D Companion status.
 */
export function renderLiveStatusBox(summary?: LiveStatusSummary): string {
  const s = summary ?? getLiveStatusSummary();
  const endpoint = `http://127.0.0.1:${s.port}/events`;
  const statusColor = s.bridgeOnline ? chalk.green("Online (listening)") : chalk.yellow("Starting...");
  const clientsColor = s.connectedClients > 0
    ? chalk.green(`${s.connectedClients} active`)
    : chalk.gray("0 (waiting for desktop window)");

  const personaFormatted = s.activePersona.toUpperCase();
  const modelFormatted = chalk.cyan(s.activeModel);

  const lines = [
    chalk.cyan("╭── 3D Reactive Avatar Live Mode ────────────────────────────────────╮"),
    chalk.cyan("│ ") + `${chalk.bold("Bridge Endpoint  :")} ${endpoint.padEnd(50)}` + chalk.cyan("│"),
    chalk.cyan("│ ") + `${chalk.bold("Bridge Status    :")} ${statusColor.padEnd(59)}` + chalk.cyan("│"),
    chalk.cyan("│ ") + `${chalk.bold("Active 3D Model  :")} ${modelFormatted.padEnd(59)}` + chalk.cyan("│"),
    chalk.cyan("│ ") + `${chalk.bold("Active Persona   :")} ${personaFormatted.padEnd(50)}` + chalk.cyan("│"),
    chalk.cyan("│ ") + `${chalk.bold("Connected Clients:")} ${clientsColor.padEnd(59)}` + chalk.cyan("│"),
    chalk.cyan("│                                                                    │"),
    chalk.cyan("│ ") + chalk.gray("Tip: Use '/live eli' or '/live rei' to switch 3D models seamlessly.") + chalk.cyan(" │"),
    chalk.cyan("╰────────────────────────────────────────────────────────────────────╯"),
  ];

  return lines.join("\n");
}

/**
 * Internal getter and setter for testing process lifecycle management.
 */
export function getActiveCompanionProcess(): ChildProcess | null {
  return activeCompanionProcess;
}

export function setActiveCompanionProcess(proc: ChildProcess | null): void {
  activeCompanionProcess = proc;
}
