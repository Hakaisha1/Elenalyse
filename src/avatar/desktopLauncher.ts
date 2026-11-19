import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { getGlobalBroadcaster } from "./bridge/AvatarEventBroadcaster.js";
import { syncAvatarPersona } from "./runtime.js";
import { DEFAULT_BRIDGE_PORT } from "./types.js";
import { getConfig } from "../config.js";

let activeCompanionProcess: ChildProcess | null = null;
let activeViteProcess: ChildProcess | null = null;

export interface LaunchDesktopOptions {
  persona?: string;
  mode?: "dev" | "tauri" | "auto";
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
 * Locate compiled native desktop binary if available.
 */
export function findNativeDesktopBinary(projectRoot: string): string | null {
  const isWin = process.platform === "win32";
  const binaryName = isWin ? "desktop.exe" : "desktop";

  const candidates = [
    path.join(projectRoot, "desktop", "src-tauri", "target", "release", binaryName),
    path.join(projectRoot, "desktop", "src-tauri", "target", "debug", binaryName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
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

  // Ensure companion window closes when CLI process exits
  try {
    process.once("exit", () => {
      stopDesktopCompanion();
    });
  } catch {}

  const projectRoot = getProjectRoot();
  const desktopDir = path.join(projectRoot, "desktop");
  const viteBin = path.join(desktopDir, "node_modules", "vite", "bin", "vite.js");
  const tauriCli = path.join(desktopDir, "node_modules", "@tauri-apps", "cli", "tauri.js");
  const nativeBinary = findNativeDesktopBinary(projectRoot);

  try {
    // 1. If native compiled Tauri executable exists, ensure Vite is up and run the window
    if (nativeBinary) {
      if (fs.existsSync(viteBin)) {
        try {
          const viteChild = spawn(process.execPath, [viteBin], {
            cwd: desktopDir,
            detached: true,
            stdio: "ignore",
          });
          viteChild.unref();
          activeViteProcess = viteChild;
        } catch {
          // If already running or cannot spawn, proceed to launch window
        }
      }

      const child = spawn(nativeBinary, [], {
        cwd: desktopDir,
        detached: true,
        stdio: "ignore",
      });

      child.unref();
      activeCompanionProcess = child;

      return {
        spawned: true,
        pid: child.pid,
        message: `Desktop companion window (${path.basename(nativeBinary)}) launched in background.`,
      };
    }

    // 2. If no prebuilt native binary exists, spawn Tauri dev via local CLI
    if (fs.existsSync(tauriCli)) {
      const child = spawn(process.execPath, [tauriCli, "dev"], {
        cwd: desktopDir,
        detached: true,
        stdio: "ignore",
      });

      child.unref();
      activeCompanionProcess = child;

      return {
        spawned: true,
        pid: child.pid,
        message: "Desktop companion window (tauri dev) launched in background.",
      };
    }

    // 3. Fallback: launch web preview dev server without DEP0190 warning
    const isWin = process.platform === "win32";
    const child = isWin
      ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm run desktop:dev"], {
          cwd: projectRoot,
          detached: true,
          stdio: "ignore",
        })
      : spawn("npm", ["run", "desktop:dev"], {
          cwd: projectRoot,
          detached: true,
          stdio: "ignore",
        });

    child.unref();
    activeCompanionProcess = child;

    return {
      spawned: true,
      pid: child.pid,
      message: "Desktop companion (dev web) launched in background.",
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
  let stopped = false;

  if (activeCompanionProcess && activeCompanionProcess.pid) {
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
    stopped = true;
  }

  if (activeViteProcess && activeViteProcess.pid) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", activeViteProcess.pid.toString(), "/f", "/t"], {
          stdio: "ignore",
        });
      } else {
        activeViteProcess.kill();
      }
    } catch {
      // Ignore errors during termination
    }

    activeViteProcess = null;
  }

  // On Windows, additionally ensure any lingering desktop.exe instance is stopped
  if (stopped && process.platform === "win32") {
    try {
      spawn("taskkill", ["/im", "desktop.exe", "/f"], { stdio: "ignore" });
    } catch {
      // Ignore if no desktop.exe is running
    }
  }

  return stopped;
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

export function getActiveViteProcess(): ChildProcess | null {
  return activeViteProcess;
}

export function setActiveViteProcess(proc: ChildProcess | null): void {
  activeViteProcess = proc;
}
