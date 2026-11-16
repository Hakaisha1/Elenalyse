import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import {
  AvatarEventBroadcaster,
  VoiceEventPayload,
} from "../src/avatar/bridge/AvatarEventBroadcaster.js";
import { ReactiveAvatarFSM } from "../src/avatar/fsm/ReactiveAvatarFSM.js";
import { createStatePayload } from "../src/avatar/types.js";
import {
  startBridgeServer,
  stopBridgeServer,
  hasConnectedClients,
  broadcastSpeakEvent,
  broadcastPersonaEvent,
  broadcastAvatarState,
} from "../src/bridge.js";

const TEST_PORT = 39428;

describe("AvatarEventBroadcaster & Unified Bridge Suite", () => {
  let broadcaster: AvatarEventBroadcaster;

  beforeEach(() => {
    broadcaster = new AvatarEventBroadcaster({ port: TEST_PORT });
  });

  afterEach(() => {
    broadcaster.close();
    stopBridgeServer();
  });

  // 1. Non-blocking fire-and-forget behavior when 0 clients are connected
  it("executes non-blocking fire-and-forget when 0 clients are connected", () => {
    expect(broadcaster.hasConnectedClients()).toBe(false);
    expect(broadcaster.connectedClientsCount).toBe(0);

    // None of these should throw or block
    expect(() => {
      broadcaster.broadcastState(createStatePayload("thinking", "eli", { detail: "query" }));
      broadcaster.broadcastPersonaEvent("rei");
      broadcaster.broadcastSpeakEvent({
        id: "voice_1",
        persona: "rei",
        text: "hello",
        audioBase64: "dGVzdA==",
        cues: [],
        totalDuration: 1.0,
      });
    }).not.toThrow();

    expect(broadcaster.getCurrentPayload().state).toBe("thinking");
    expect(broadcaster.getCurrentPayload().persona).toBe("rei");
  });

  // 2. Connected client receives handshake + state snapshot, and subsequent transitions
  it("streams initial handshake, snapshot, and subsequent transitions to SSE clients", async () => {
    const fsm = new ReactiveAvatarFSM("eli");
    broadcaster.attachFSM(fsm);

    const started = await broadcaster.start(TEST_PORT);
    expect(started).toBe(true);

    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/events`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(broadcaster.connectedClientsCount).toBe(1);

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();

    // Read initial handshake and state snapshot
    const initialChunk = await reader!.read();
    const initialText = decoder.decode(initialChunk.value);
    expect(initialText).toContain("event: connected");
    expect(initialText).toContain("event: avatar:state");
    expect(initialText).toContain('"state":"idle"');

    // Trigger state transition in FSM
    fsm.transitionTo("thinking", "user_prompt");

    const secondChunk = await reader!.read();
    const secondText = decoder.decode(secondChunk.value);
    expect(secondText).toContain("event: avatar:state");
    expect(secondText).toContain('"state":"thinking"');
    expect(secondText).toContain('"detail":"user_prompt"');

    // Trigger executing transition
    fsm.transitionTo("executing", "readFile (step 1/5)");

    const thirdChunk = await reader!.read();
    const thirdText = decoder.decode(thirdChunk.value);
    expect(thirdText).toContain("event: avatar:state");
    expect(thirdText).toContain('"state":"executing"');
    expect(thirdText).toContain("readFile (step 1/5)");

    await reader!.cancel();
    fsm.dispose();
  });

  // 3. GET /state and GET /health endpoints
  it("responds to GET /state and GET /health correctly", async () => {
    broadcaster.transitionState("thinking", "analyzing_repo", "sora");
    await broadcaster.start(TEST_PORT);

    // Test /state
    const stateRes = await fetch(`http://127.0.0.1:${TEST_PORT}/state`);
    expect(stateRes.status).toBe(200);
    const stateData = await stateRes.json();
    expect(stateData.event).toBe("state_change");
    expect(stateData.state).toBe("thinking");
    expect(stateData.persona).toBe("sora");
    expect(stateData.detail).toBe("analyzing_repo");

    // Test /health
    const healthRes = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    expect(healthRes.status).toBe(200);
    const healthData = await healthRes.json();
    expect(healthData.status).toBe("ok");
    expect(healthData.state).toBe("thinking");
    expect(healthData.persona).toBe("sora");
    expect(healthData.connectedClients).toBe(0);
  });

  // 4. EADDRINUSE handling
  it("handles EADDRINUSE gracefully without throwing unhandled exceptions", async () => {
    const startedA = await broadcaster.start(TEST_PORT);
    expect(startedA).toBe(true);

    // Attempt to start a second broadcaster on the exact same port
    const broadcasterB = new AvatarEventBroadcaster({ port: TEST_PORT });
    const startedB = await broadcasterB.start(TEST_PORT);
    expect(startedB).toBe(false);

    broadcasterB.close();
  });

  // 5. Clean shutdown via close() / dispose()
  it("shuts down cleanly, disconnects clients, and releases the listening port", async () => {
    await broadcaster.start(TEST_PORT);
    expect(broadcaster.isListening).toBe(true);

    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/events`);
    const reader = response.body?.getReader();
    expect(broadcaster.connectedClientsCount).toBe(1);

    // Consume initial handshake chunk
    await reader!.read();

    broadcaster.close();
    expect(broadcaster.isListening).toBe(false);
    expect(broadcaster.connectedClientsCount).toBe(0);

    // Stream reader should detect stream end
    const result = await reader!.read();
    expect(result.done).toBe(true);

    // Port should be reusable immediately
    const broadcasterNew = new AvatarEventBroadcaster({ port: TEST_PORT });
    const restarted = await broadcasterNew.start(TEST_PORT);
    expect(restarted).toBe(true);
    broadcasterNew.close();
  });

  // 6. Backward compatibility with src/bridge.ts exports
  it("preserves backward compatibility for src/bridge.ts exports", async () => {
    const started = await startBridgeServer(TEST_PORT);
    expect(started).toBe(true);
    expect(hasConnectedClients()).toBe(false);

    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/events`);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    expect(hasConnectedClients()).toBe(true);

    // Consume initial handshake & snapshot
    await reader!.read();

    // Test legacy broadcastPersonaEvent
    broadcastPersonaEvent("rin");
    const personaChunk = await reader!.read();
    const personaText = decoder.decode(personaChunk.value);
    expect(personaText).toContain("event: persona");
    expect(personaText).toContain('"persona":"rin"');

    // Test legacy broadcastSpeakEvent
    const speakPayload: VoiceEventPayload = {
      id: "v_legacy_1",
      persona: "rin",
      text: "Testing legacy bridge",
      audioBase64: "AQIDBA==",
      cues: [{ time: 0, duration: 0.5, vowel: "aa", text: "Te" }],
      totalDuration: 0.5,
    };
    broadcastSpeakEvent(speakPayload);

    const speakChunk = await reader!.read();
    const speakText = decoder.decode(speakChunk.value);
    expect(speakText).toContain("event: speak");
    expect(speakText).toContain("Testing legacy bridge");

    // Test broadcastAvatarState
    broadcastAvatarState({
      event: "state_change",
      state: "success",
      persona: "rin",
      detail: "legacy_compat_success",
      timestamp: Date.now(),
    });

    const stateChunk = await reader!.read();
    const stateText = decoder.decode(stateChunk.value);
    expect(stateText).toContain("event: avatar:state");
    expect(stateText).toContain('"state":"success"');

    await reader!.cancel();
    stopBridgeServer();
  });
});
