import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { UndoManager, undoLastChange, recordSnapshot, clearUndoHistory } from "../src/undo.js";

describe("UndoManager", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "elenalyse-undo-test-"));
    process.chdir(testDir);
    clearUndoHistory();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    clearUndoHistory();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("handles empty stack gracefully when no changes have occurred", async () => {
    const result = await undoLastChange();
    expect(result.success).toBe(false);
    expect(result.message).toBe("No file changes to undo.");
  });

  it("records a snapshot of an existing file and restores its previous content on undo", async () => {
    const testFile = "sample.txt";
    const initialContent = "Hello World - Version 1";
    await fs.writeFile(testFile, initialContent, "utf-8");

    // Take snapshot before modifying
    const snapshot = await recordSnapshot(testFile);
    expect(snapshot.existed).toBe(true);
    expect(snapshot.content).toBe(initialContent);

    // Overwrite file
    await fs.writeFile(testFile, "Hello World - Modified Version 2", "utf-8");
    const modifiedContent = await fs.readFile(testFile, "utf-8");
    expect(modifiedContent).toBe("Hello World - Modified Version 2");

    // Perform undo
    const result = await undoLastChange();
    expect(result.success).toBe(true);
    expect(result.action).toBe("restored");
    expect(result.filePath).toBe(testFile);

    // Verify content restored
    const restoredContent = await fs.readFile(testFile, "utf-8");
    expect(restoredContent).toBe(initialContent);
  });

  it("records a snapshot of a non-existent file and deletes it on undo", async () => {
    const newFile = "brand-new-file.ts";

    // Take snapshot before creating file
    const snapshot = await recordSnapshot(newFile);
    expect(snapshot.existed).toBe(false);
    expect(snapshot.content).toBeUndefined();

    // Create file
    await fs.writeFile(newFile, "export const x = 42;", "utf-8");
    expect(await fs.readFile(newFile, "utf-8")).toBe("export const x = 42;");

    // Perform undo
    const result = await undoLastChange();
    expect(result.success).toBe(true);
    expect(result.action).toBe("deleted");
    expect(result.filePath).toBe(newFile);

    // Verify file is gone
    await expect(fs.stat(newFile)).rejects.toThrow();
  });

  it("restores multiple file modifications in LIFO order", async () => {
    const fileA = "fileA.txt";
    const fileB = "fileB.txt";

    await fs.writeFile(fileA, "A-initial", "utf-8");
    await fs.writeFile(fileB, "B-initial", "utf-8");

    // Change A
    await recordSnapshot(fileA);
    await fs.writeFile(fileA, "A-changed", "utf-8");

    // Change B
    await recordSnapshot(fileB);
    await fs.writeFile(fileB, "B-changed", "utf-8");

    // Undo B first
    const undoB = await undoLastChange();
    expect(undoB.filePath).toBe(fileB);
    expect(await fs.readFile(fileB, "utf-8")).toBe("B-initial");
    expect(await fs.readFile(fileA, "utf-8")).toBe("A-changed");

    // Undo A next
    const undoA = await undoLastChange();
    expect(undoA.filePath).toBe(fileA);
    expect(await fs.readFile(fileA, "utf-8")).toBe("A-initial");

    // No more undo
    const undoNone = await undoLastChange();
    expect(undoNone.success).toBe(false);
  });
});
