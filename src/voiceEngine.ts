import fs from "fs";
import path from "path";
import os from "os";
import { spawn, execSync } from "child_process";
import Seven from "node-7z";
import sevenBin from "7zip-bin";

const ENGINE_DIR = path.join(os.homedir(), ".elenalyse", "voicevox-engine");

function getEngineExecutablePath(): string {
  // VoiceVox engine extraction usually creates a nested folder based on the OS.
  const winPath = path.join(ENGINE_DIR, "windows-directml-engine", "run.exe");
  const winCpuPath = path.join(ENGINE_DIR, "windows-cpu-engine", "run.exe");
  const macPath = path.join(ENGINE_DIR, "macos-cpu-engine", "run");
  const linuxPath = path.join(ENGINE_DIR, "linux-cpu-engine", "run");
  
  if (os.platform() === "win32") {
    if (fs.existsSync(winPath)) return winPath;
    if (fs.existsSync(winCpuPath)) return winCpuPath;
    return path.join(ENGINE_DIR, "run.exe"); // fallback
  } else if (os.platform() === "darwin") {
    if (fs.existsSync(macPath)) return macPath;
    return path.join(ENGINE_DIR, "run");
  } else {
    if (fs.existsSync(linuxPath)) return linuxPath;
    return path.join(ENGINE_DIR, "run");
  }
}

async function getReleaseAssetUrlForPlatform(): Promise<string> {
  const releaseUrl = "https://api.github.com/repos/VOICEVOX/voicevox_engine/releases/latest";
  const response = await fetch(releaseUrl);
  if (!response.ok) throw new Error("Failed to fetch VOICEVOX releases");
  
  const data = await response.json();
  const assets = data.assets;
  
  let targetName = "";
  if (os.platform() === "win32") {
    targetName = "windows-cpu";
  } else if (os.platform() === "darwin") {
    targetName = "macos-cpu";
  } else {
    targetName = "linux-cpu";
  }

  // VoiceVox releases uses .7z.001
  const asset = assets.find((a: any) => a.name.includes(targetName) && a.name.endsWith(".7z.001"));
  if (!asset) {
    throw new Error(`Could not find VOICEVOX ENGINE asset for platform ${targetName}`);
  }
  
  return asset.browser_download_url;
}

export async function ensureEngineDownloaded(onProgress?: (msg: string) => void): Promise<void> {
  if (fs.existsSync(ENGINE_DIR) && fs.readdirSync(ENGINE_DIR).length > 0) {
    return;
  }

  fs.mkdirSync(ENGINE_DIR, { recursive: true });
  onProgress?.("Downloading VOICEVOX ENGINE (one-time setup, approx 100-300MB)...");

  const assetUrl = await getReleaseAssetUrlForPlatform();
  const temp7zPath = path.join(ENGINE_DIR, "engine.7z.001");

  onProgress?.(`Downloading from ${assetUrl}...`);
  
  const res = await fetch(assetUrl);
  if (!res.ok) throw new Error("Failed to download VOICEVOX engine");
  
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(temp7zPath, Buffer.from(arrayBuffer));
  
  onProgress?.("Extracting VOICEVOX ENGINE using 7z...");
  
  await new Promise<void>((resolve, reject) => {
    const stream = Seven.extractFull(temp7zPath, ENGINE_DIR, {
      $bin: sevenBin.path7za
    });

    stream.on('end', () => resolve());
    stream.on('error', (err) => reject(err));
  });

  fs.unlinkSync(temp7zPath);
  
  if (os.platform() !== "win32") {
    const execPath = getEngineExecutablePath();
    if (fs.existsSync(execPath)) {
      fs.chmodSync(execPath, 0o755);
    }
  }
  
  onProgress?.("Finished downloading and configuring VOICEVOX ENGINE.");
}

let engineProcess: ReturnType<typeof spawn> | null = null;

export async function ensureEngineRunning(): Promise<void> {
  try {
    execSync("curl -s -o /dev/null http://127.0.0.1:50021/version");
    return; // Already running
  } catch {
    // Not running, proceed to start
  }

  const execPath = getEngineExecutablePath();
  if (!fs.existsSync(execPath)) {
    throw new Error("VOICEVOX ENGINE executable not found at " + execPath);
  }
  
  engineProcess = spawn(execPath, [], { detached: true, stdio: "ignore" });
  engineProcess.unref();

  // Poll endpoint /version until it responds, with a 15-second timeout
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      execSync("curl -s -o /dev/null http://127.0.0.1:50021/version");
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error("VOICEVOX ENGINE is not responding after 15 seconds. Please try restarting.");
}
