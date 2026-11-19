import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SLASH_COMMANDS,
  LIVE_SUBCOMMANDS,
  getContextualSuggestions,
} from "../src/ui/slashCommands.js";
import {
  launchDesktopCompanion,
  stopDesktopCompanion,
  getLiveStatusSummary,
  resolveModelFilename,
  renderLiveStatusBox,
  setActiveCompanionProcess,
  getActiveCompanionProcess,
} from "../src/avatar/desktopLauncher.js";
import {
  syncAvatarPersona,
  getGlobalBroadcaster,
  setGlobalBroadcaster,
} from "../src/avatar/index.js";
import { AvatarEventBroadcaster } from "../src/avatar/bridge/AvatarEventBroadcaster.js";
import { setConfig, getConfig } from "../src/config.js";
import { startBridgeServer, stopBridgeServer } from "../src/bridge.js";

describe("Live Mode & Desktop Companion Integration Suite", () => {
  let broadcaster: AvatarEventBroadcaster;
  const TEST_PORT = 39425;

  beforeEach(() => {
    setActiveCompanionProcess(null);
    broadcaster = new AvatarEventBroadcaster({ port: TEST_PORT });
    setGlobalBroadcaster(broadcaster);
  });

  afterEach(() => {
    stopBridgeServer();
    stopDesktopCompanion();
    setGlobalBroadcaster(null);
  });

  // 1. Slash Command & Autocomplete Registration
  describe("Slash Command & Subcommand Suggestions", () => {
    it("registers /live in SLASH_COMMANDS with correct metadata", () => {
      const liveCmd = SLASH_COMMANDS.find((c) => c.command === "/live");
      expect(liveCmd).toBeDefined();
      expect(liveCmd?.syntax).toContain("/live");
      expect(liveCmd?.description).toContain("3D Reactive Avatar companion");
    });

    it("exports all required LIVE_SUBCOMMANDS", () => {
      const values = LIVE_SUBCOMMANDS.map((s) => s.value);
      expect(values).toContain("on");
      expect(values).toContain("launch");
      expect(values).toContain("eli");
      expect(values).toContain("rei");
      expect(values).toContain("status");
      expect(values).toContain("off");
    });

    it("returns top-level command for '/live' and subcommands for '/live '", () => {
      const sugg1 = getContextualSuggestions("/live");
      expect(sugg1.title).toBe("Available Commands");
      expect(sugg1.items.length).toBe(1);
      expect(sugg1.items[0].value).toBe("/live");

      const sugg2 = getContextualSuggestions("/live ");
      expect(sugg2.title).toBe("3D Live Avatar Companion");
      expect(sugg2.items.length).toBe(LIVE_SUBCOMMANDS.length);
    });

    it("filters subcommands contextually based on query", () => {
      const eliSugg = getContextualSuggestions("/live e");
      expect(eliSugg.items.length).toBe(1);
      expect(eliSugg.items[0].value).toBe("eli");

      const reiSugg = getContextualSuggestions("/live r");
      expect(reiSugg.items.length).toBe(1);
      expect(reiSugg.items[0].value).toBe("rei");

      const statSugg = getContextualSuggestions("/live stat");
      expect(statSugg.items.length).toBe(1);
      expect(statSugg.items[0].value).toBe("status");

      const offSugg = getContextualSuggestions("/live of");
      expect(offSugg.items.length).toBe(1);
      expect(offSugg.items[0].value).toBe("off");
    });
  });

  // 2. Persona-to-3D VRM Model Resolution
  describe("3D VRM Model Resolution", () => {
    it("resolves exact 3D models for ELI and REI personas", () => {
      expect(resolveModelFilename("eli")).toBe("ELI_Model.vrm");
      expect(resolveModelFilename("rei")).toBe("REI_Model.vrm");
    });

    it("resolves graceful fallback models for secondary personas", () => {
      expect(resolveModelFilename("sora")).toBe("ELI_Model.vrm");
      expect(resolveModelFilename("rin")).toBe("REI_Model.vrm");
    });

    it("is case-insensitive when resolving model filenames", () => {
      expect(resolveModelFilename("ELI")).toBe("ELI_Model.vrm");
      expect(resolveModelFilename("ReI")).toBe("REI_Model.vrm");
      expect(resolveModelFilename("SoRa")).toBe("ELI_Model.vrm");
      expect(resolveModelFilename("RIN")).toBe("REI_Model.vrm");
    });
  });

  // 3. Status Summary & Formatted Box Output
  describe("Live Status Summary & HUD Box", () => {
    it("returns complete live status summary with bridge information", () => {
      const summary = getLiveStatusSummary();
      expect(summary).toHaveProperty("bridgeOnline");
      expect(summary).toHaveProperty("port");
      expect(summary).toHaveProperty("connectedClients");
      expect(summary).toHaveProperty("activePersona");
      expect(summary).toHaveProperty("activeModel");
      expect(typeof summary.bridgeOnline).toBe("boolean");
      expect(typeof summary.port).toBe("number");
    });

    it("formats a sleek HUD status box containing endpoint, model, and instructions", () => {
      const box = renderLiveStatusBox({
        bridgeOnline: true,
        port: 39420,
        connectedClients: 1,
        activePersona: "eli",
        activeModel: "ELI_Model.vrm",
      });

      expect(box).toContain("3D Reactive Avatar Live Mode");
      expect(box).toContain("http://127.0.0.1:39420/events");
      expect(box).toContain("ELI_Model.vrm");
      expect(box).toContain("ELI");
      expect(box).toContain("/live eli");
      expect(box).toContain("/live rei");
    });
  });

  // 4. Model Switching between ELI and REI
  describe("Dynamic Model Switching between ELI and REI", () => {
    it("switches active model seamlessly when changing persona to ELI and REI", () => {
      // Switch to ELI
      setConfig({ activePersona: "eli" });
      syncAvatarPersona("eli");
      let summary = getLiveStatusSummary();
      expect(summary.activePersona).toBe("eli");
      expect(summary.activeModel).toBe("ELI_Model.vrm");
      expect(broadcaster.getCurrentPayload().persona).toBe("eli");

      // Switch to REI
      setConfig({ activePersona: "rei" });
      syncAvatarPersona("rei");
      summary = getLiveStatusSummary();
      expect(summary.activePersona).toBe("rei");
      expect(summary.activeModel).toBe("REI_Model.vrm");
      expect(broadcaster.getCurrentPayload().persona).toBe("rei");
    });
  });

  // 5. Desktop Companion Process Lifecycle
  describe("Desktop Companion Process Lifecycle", () => {
    it("returns false from stopDesktopCompanion when no process is running", () => {
      expect(stopDesktopCompanion()).toBe(false);
    });

    it("prevents double-spawn when a companion process is already active", () => {
      const mockKill = vi.fn();
      const mockChild = {
        pid: 12345,
        killed: false,
        kill: mockKill,
      } as any;

      setActiveCompanionProcess(mockChild);
      expect(getActiveCompanionProcess()).toBe(mockChild);

      const result = launchDesktopCompanion();
      expect(result.spawned).toBe(false);
      expect(result.pid).toBe(12345);
      expect(result.message).toContain("already running");

      const stopped = stopDesktopCompanion();
      expect(stopped).toBe(true);
      expect(getActiveCompanionProcess()).toBeNull();
    });
  });

  // 6. Live Bridge Server Lifecycle Integration
  describe("Bridge Server Online/Offline Status", () => {
    it("reflects bridgeOnline accurately during start and stop", async () => {
      expect(getLiveStatusSummary().bridgeOnline).toBe(false);

      const started = await startBridgeServer(TEST_PORT);
      expect(started).toBe(true);
      expect(getLiveStatusSummary().bridgeOnline).toBe(true);
      expect(getLiveStatusSummary().port).toBe(TEST_PORT);

      stopBridgeServer();
      expect(getLiveStatusSummary().bridgeOnline).toBe(false);
    });
  });
});
