import fs from "fs/promises";
import path from "path";

export interface FileSnapshot {
  filePath: string;
  existed: boolean;
  content?: string;
  timestamp: number;
}

export interface UndoResult {
  success: boolean;
  filePath?: string;
  action?: "restored" | "deleted";
  message: string;
}

export class UndoManager {
  private stack: FileSnapshot[] = [];

  /**
   * Record a snapshot of a file before it is modified or created.
   */
  async recordSnapshot(filePath: string): Promise<FileSnapshot> {
    const absolutePath = path.resolve(process.cwd(), filePath);
    try {
      const content = await fs.readFile(absolutePath, "utf-8");
      const snapshot: FileSnapshot = {
        filePath,
        existed: true,
        content,
        timestamp: Date.now(),
      };
      this.stack.push(snapshot);
      return snapshot;
    } catch {
      // File does not exist yet (it will be newly created)
      const snapshot: FileSnapshot = {
        filePath,
        existed: false,
        timestamp: Date.now(),
      };
      this.stack.push(snapshot);
      return snapshot;
    }
  }

  /**
   * Undo the most recent file change in the stack.
   * If the file existed previously, restores its content.
   * If the file was newly created, deletes it.
   */
  async undoLastChange(): Promise<UndoResult> {
    const snapshot = this.stack.pop();
    if (!snapshot) {
      return {
        success: false,
        message: "No file changes to undo.",
      };
    }

    const absolutePath = path.resolve(process.cwd(), snapshot.filePath);
    try {
      if (snapshot.existed) {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, snapshot.content ?? "", "utf-8");
        return {
          success: true,
          filePath: snapshot.filePath,
          action: "restored",
          message: `Restored ${snapshot.filePath} to previous state.`,
        };
      } else {
        try {
          await fs.unlink(absolutePath);
        } catch (err: any) {
          if (err.code !== "ENOENT") throw err;
        }
        return {
          success: true,
          filePath: snapshot.filePath,
          action: "deleted",
          message: `Deleted newly created file ${snapshot.filePath}.`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        filePath: snapshot.filePath,
        message: `Failed to undo change for ${snapshot.filePath}: ${error.message}`,
      };
    }
  }

  getHistory(): readonly FileSnapshot[] {
    return this.stack;
  }

  clear(): void {
    this.stack = [];
  }
}

export const undoManager = new UndoManager();
export const recordSnapshot = (filePath: string) => undoManager.recordSnapshot(filePath);
export const undoLastChange = () => undoManager.undoLastChange();
export const clearUndoHistory = () => undoManager.clear();
