import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  emitAvatarState,
  syncAvatarPersona,
  getGlobalAvatarRuntime,
  resetAvatarRuntime,
} from "../src/avatar/runtime.js";
import { StateTransitionEvent } from "../src/avatar/fsm/ReactiveAvatarFSM.js";
import { MIN_THINKING_DWELL_MS } from "../src/avatar/types.js";

describe("CLI Core Engine & Avatar Lifecycle Integration Suite", () => {
  let capturedEvents: StateTransitionEvent[];
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    resetAvatarRuntime();
    capturedEvents = [];
    const { fsm } = getGlobalAvatarRuntime();
    unsubscribe = fsm.subscribe((evt) => capturedEvents.push(evt));
  });

  afterEach(() => {
    unsubscribe();
    resetAvatarRuntime();
    vi.useRealTimers();
  });

  // 1. Normal prompt turn lifecycle (idle -> thinking -> speaking -> success -> idle)
  it("orchestrates standard prompt turn lifecycle cleanly", () => {
    const { fsm } = getGlobalAvatarRuntime();
    expect(fsm.state).toBe("idle");

    // 1. User submits prompt
    emitAvatarState("thinking", { detail: "prompt_submitted", persona: "eli" });
    expect(fsm.state).toBe("thinking");
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0].toState).toBe("thinking");
    expect(capturedEvents[0].detail).toBe("prompt_submitted");

    // Advance dwell past MIN_THINKING_DWELL_MS (300ms)
    vi.advanceTimersByTime(350);

    // 2. Response ready: TTS playback starts
    emitAvatarState("speaking", { detail: "voice_playback" });
    expect(fsm.state).toBe("speaking");
    expect(capturedEvents).toHaveLength(2);
    expect(capturedEvents[1].toState).toBe("speaking");

    // Multiple chunk calls while speaking should cleanly no-op
    emitAvatarState("speaking", { detail: "voice_chunk_2" });
    emitAvatarState("speaking", { detail: "voice_chunk_3" });
    expect(capturedEvents).toHaveLength(2); // No flood of duplicates

    // 3. Playback completes
    emitAvatarState("success", { detail: "turn_complete" });
    expect(fsm.state).toBe("success");
    expect(capturedEvents).toHaveLength(3);
    expect(capturedEvents[2].toState).toBe("success");

    // 4. Exactly after 2000ms auto-reset cooldown, returns to idle
    vi.advanceTimersByTime(1999);
    expect(fsm.state).toBe("success");

    vi.advanceTimersByTime(1);
    expect(fsm.state).toBe("idle");
    expect(capturedEvents).toHaveLength(4);
    expect(capturedEvents[3].toState).toBe("idle");
  });

  // 2. Tool execution turn lifecycle (thinking -> executing -> thinking / speaking -> success)
  it("handles multi-step autonomous tool execution without visual flicker", () => {
    const { fsm } = getGlobalAvatarRuntime();

    // 1. User query initiates thinking
    emitAvatarState("thinking", { detail: "prompt_submitted" });
    expect(fsm.state).toBe("thinking");

    // 2. Step 1: Tool execution started
    emitAvatarState("executing", { detail: "calling readFile(src/index.ts) [Step 1/25]" });
    expect(fsm.state).toBe("executing");
    expect(capturedEvents.at(-1)?.toState).toBe("executing");
    expect(capturedEvents.at(-1)?.detail).toContain("readFile");

    // Simulate tool running
    vi.advanceTimersByTime(100);

    // 3. Step 1 tool finishes, model resumes thinking
    emitAvatarState("thinking", { detail: "evaluating_tool_result" });
    expect(fsm.state).toBe("thinking");
    expect(capturedEvents.at(-1)?.toState).toBe("thinking");

    // 4. Step 2: Next tool execution
    emitAvatarState("executing", { detail: "calling editFile(src/index.ts) [Step 2/25]" });
    expect(fsm.state).toBe("executing");

    vi.advanceTimersByTime(150);

    // 5. Tool completes, final synthesis in thinking
    emitAvatarState("thinking", { detail: "evaluating_tool_result" });
    expect(fsm.state).toBe("thinking");

    // Advance dwell duration
    vi.advanceTimersByTime(MIN_THINKING_DWELL_MS);

    // 6. Speaking final report
    emitAvatarState("speaking", { detail: "voice_playback" });
    expect(fsm.state).toBe("speaking");

    // 7. Success on complete
    emitAvatarState("success", { detail: "turn_complete" });
    expect(fsm.state).toBe("success");
  });

  // 3. Recoverable failover vs. Terminal error preemption
  it("distinguishes in-flight provider failover from terminal error preemption", () => {
    const { fsm } = getGlobalAvatarRuntime();

    // Prompt submitted
    emitAvatarState("thinking", { detail: "prompt_submitted" });
    expect(fsm.state).toBe("thinking");

    // 150ms in, primary provider hits rate limit 429
    vi.advanceTimersByTime(150);

    // Failover triggered: remains in thinking with provider_failover detail
    emitAvatarState("thinking", { detail: "provider_failover" });
    expect(fsm.state).toBe("thinking");
    expect(fsm.detail).toBe("provider_failover");

    // Failover must NOT trigger an auto-reset to idle!
    vi.advanceTimersByTime(3000);
    expect(fsm.state).toBe("thinking");

    // Now trigger terminal error
    emitAvatarState("error", { detail: "Network unreachable after fallback" });
    expect(fsm.state).toBe("error");
    expect(capturedEvents.at(-1)?.toState).toBe("error");
    expect(capturedEvents.at(-1)?.crossfadeDurationMs).toBe(150); // Fast preemption

    // Error auto-resets to idle after 2500ms
    vi.advanceTimersByTime(2499);
    expect(fsm.state).toBe("error");

    vi.advanceTimersByTime(1);
    expect(fsm.state).toBe("idle");
    expect(capturedEvents.at(-1)?.toState).toBe("idle");
  });

  // 4. Persona switch synchronization
  it("synchronizes persona across FSM and bridge broadcaster", () => {
    const { fsm, broadcaster } = getGlobalAvatarRuntime();

    syncAvatarPersona("rei");
    expect(fsm.persona).toBe("rei");
    expect(broadcaster.getCurrentPayload().persona).toBe("rei");

    emitAvatarState("thinking", { detail: "test_rei" });
    expect(capturedEvents.at(-1)?.persona).toBe("rei");

    syncAvatarPersona("sora");
    expect(fsm.persona).toBe("sora");
    expect(broadcaster.getCurrentPayload().persona).toBe("sora");

    syncAvatarPersona("rin");
    expect(fsm.persona).toBe("rin");
  });

  // 5. User abort via SIGINT
  it("handles user abort cleanly by reverting to idle", () => {
    const { fsm } = getGlobalAvatarRuntime();

    emitAvatarState("thinking", { detail: "prompt_submitted" });
    expect(fsm.state).toBe("thinking");

    // User presses Ctrl+C
    emitAvatarState("idle", { detail: "user_aborted" });
    expect(fsm.state).toBe("idle");
    expect(capturedEvents.at(-1)?.toState).toBe("idle");
    expect(capturedEvents.at(-1)?.detail).toBe("user_aborted");
  });
});
