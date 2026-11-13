import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  saveSession,
  loadSession,
  listSessions,
  setCustomSessionsDir,
} from "../src/session.js";

describe("Session Persistence", () => {
  let tempSessionsDir: string;

  beforeEach(async () => {
    tempSessionsDir = await fs.mkdtemp(path.join(os.tmpdir(), "elenalyse-sessions-test-"));
    setCustomSessionsDir(tempSessionsDir);
  });

  afterEach(async () => {
    setCustomSessionsDir(null);
    try {
      await fs.rm(tempSessionsDir, { recursive: true, force: true });
    } catch {}
  });

  it("saves a session with memory and sessionState into a JSON file", async () => {
    const memory = {
      eli: [{ role: "user", content: "Hello Eli" }],
      rei: [],
      sora: [],
      rin: [],
    };
    const sessionState = { filesTouched: new Set(["src/index.ts", "package.json"]) };

    const saveResult = await saveSession("my-project", memory, sessionState);
    expect(saveResult.success).toBe(true);
    expect(saveResult.message).toContain("my-project");

    const expectedFile = path.join(tempSessionsDir, "my-project.json");
    const exists = await fs.stat(expectedFile).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const content = JSON.parse(await fs.readFile(expectedFile, "utf-8"));
    expect(content.name).toBe("my-project");
    expect(content.memory.eli).toHaveLength(1);
    expect(content.sessionState.filesTouched).toContain("src/index.ts");
    expect(content.sessionState.filesTouched).toContain("package.json");
  });

  it("loads a previously saved session successfully", async () => {
    const memory = {
      eli: [],
      rei: [{ role: "assistant", content: "Konbanwa" }],
      sora: [],
      rin: [],
    };
    const sessionState = { filesTouched: ["README.md"] };

    await saveSession("demo-session", memory, sessionState);

    const loadResult = await loadSession("demo-session");
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBeDefined();
    expect(loadResult.data?.name).toBe("demo-session");
    expect(loadResult.data?.memory.rei).toHaveLength(1);
    expect(loadResult.data?.memory.rei[0].content).toBe("Konbanwa");
    expect(loadResult.data?.sessionState.filesTouched).toEqual(["README.md"]);
  });

  it("returns not-found error when loading non-existent session", async () => {
    const result = await loadSession("non-existent-session");
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
    expect(result.data).toBeUndefined();
  });

  it("lists all available saved session names", async () => {
    expect(await listSessions()).toEqual([]);

    await saveSession("alpha", { eli: [], rei: [], sora: [], rin: [] }, { filesTouched: [] });
    await saveSession("beta", { eli: [], rei: [], sora: [], rin: [] }, { filesTouched: [] });

    const sessions = await listSessions();
    expect(sessions.sort()).toEqual(["alpha", "beta"].sort());
  });
});
