import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ReactiveAvatarFSM,
  StateTransitionEvent,
} from "../src/avatar/fsm/ReactiveAvatarFSM.js";
import {
  MIN_THINKING_DWELL_MS,
  STATE_CONFIGS,
} from "../src/avatar/types.js";

describe("ReactiveAvatarFSM Black-Box Unit Test Suite", () => {
  let fsm: ReactiveAvatarFSM;
  let events: StateTransitionEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    fsm = new ReactiveAvatarFSM("eli");
    events = [];
    fsm.subscribe((evt) => events.push(evt));
  });

  afterEach(() => {
    fsm.dispose();
    vi.useRealTimers();
  });

  // BB-01: Initial idle state stability, default persona and config
  it("BB-01: Initial idle state stability, default persona and config", () => {
    expect(fsm.state).toBe("idle");
    expect(fsm.previousState).toBeNull();
    expect(fsm.persona).toBe("eli");
    expect(fsm.detail).toBeUndefined();
    expect(fsm.isPendingDebounce).toBe(false);
    expect(fsm.hasActiveAutoReset).toBe(false);
    expect(events).toHaveLength(0);

    // Verify deterministic state configs
    expect(STATE_CONFIGS.idle.crossfadeDurationMs).toBe(250);
    expect(STATE_CONFIGS.idle.priority).toBe(0);
    expect(STATE_CONFIGS.idle.loop).toBe(true);

    // Test custom initial persona
    const reiFsm = new ReactiveAvatarFSM("rei");
    expect(reiFsm.persona).toBe("rei");
    reiFsm.dispose();
  });

  // BB-02: idle -> thinking transition with 250ms crossfade
  it("BB-02: idle -> thinking transition with 250ms crossfade", () => {
    const success = fsm.transitionTo("thinking", "user_prompt_received");
    expect(success).toBe(true);
    expect(fsm.state).toBe("thinking");
    expect(fsm.previousState).toBe("idle");
    expect(fsm.detail).toBe("user_prompt_received");

    expect(events).toHaveLength(1);
    const evt = events[0];
    expect(evt.fromState).toBe("idle");
    expect(evt.toState).toBe("thinking");
    expect(evt.crossfadeDurationMs).toBe(250);
    expect(evt.persona).toBe("eli");
    expect(evt.detail).toBe("user_prompt_received");
  });

  // BB-03: thinking -> speaking transition enforcing MIN_THINKING_DWELL_MS (300ms debounce)
  describe("BB-03: thinking -> speaking transition enforcing MIN_THINKING_DWELL_MS", () => {
    it("enforces 300ms debounce when triggered early (e.g. at 50ms elapsed)", () => {
      fsm.transitionTo("thinking", "evaluating");
      expect(fsm.state).toBe("thinking");

      // Advance 50ms (< 300ms)
      vi.advanceTimersByTime(50);

      // Request transition to speaking
      fsm.transitionTo("speaking", "voice_stream_start");

      // Must remain in 'thinking' with pending debounce timer
      expect(fsm.state).toBe("thinking");
      expect(fsm.isPendingDebounce).toBe(true);
      expect(events).toHaveLength(1); // Only the initial thinking event

      // Advance 249ms (total 299ms from thinking entry)
      vi.advanceTimersByTime(249);
      expect(fsm.state).toBe("thinking");
      expect(fsm.isPendingDebounce).toBe(true);

      // Advance 1ms to reach exact 300ms
      vi.advanceTimersByTime(1);
      expect(fsm.state).toBe("speaking");
      expect(fsm.isPendingDebounce).toBe(false);

      expect(events).toHaveLength(2);
      const speakEvt = events[1];
      expect(speakEvt.fromState).toBe("thinking");
      expect(speakEvt.toState).toBe("speaking");
      expect(speakEvt.crossfadeDurationMs).toBe(250);
      expect(speakEvt.detail).toBe("voice_stream_start");
    });

    it("transitions immediately when elapsed dwell >= 300ms", () => {
      fsm.transitionTo("thinking", "evaluating");
      expect(fsm.state).toBe("thinking");

      // Advance past MIN_THINKING_DWELL_MS (e.g. 350ms)
      vi.advanceTimersByTime(350);

      fsm.transitionTo("speaking", "voice_stream_start");

      // Immediate transition without debounce timer
      expect(fsm.state).toBe("speaking");
      expect(fsm.isPendingDebounce).toBe(false);
      expect(events).toHaveLength(2);
      expect(events[1].toState).toBe("speaking");
    });
  });

  // BB-04: thinking -> executing -> speaking multi-step tool execution cycle
  it("BB-04: thinking -> executing -> speaking multi-step tool execution cycle", () => {
    // 1. Enter thinking
    fsm.transitionTo("thinking", "initial_prompt");
    expect(fsm.state).toBe("thinking");

    // 2. Step 1: Tool execution started
    fsm.transitionTo("executing", "readFile (step 1/25)");
    expect(fsm.state).toBe("executing");
    expect(fsm.previousState).toBe("thinking");
    expect(events.at(-1)?.crossfadeDurationMs).toBe(250);

    // Simulate tool I/O duration
    vi.advanceTimersByTime(150);

    // 3. Tool completed: Return to thinking to evaluate output
    fsm.transitionTo("thinking", "evaluating_tool_output");
    expect(fsm.state).toBe("thinking");
    expect(fsm.previousState).toBe("executing");

    // 4. Step 2: Next tool execution
    fsm.transitionTo("executing", "editFile (step 2/25)");
    expect(fsm.state).toBe("executing");
    expect(fsm.previousState).toBe("thinking");

    vi.advanceTimersByTime(200);

    // 5. Tool completed: Return to thinking
    fsm.transitionTo("thinking", "formulating_response");
    expect(fsm.state).toBe("thinking");

    // Advance dwell duration
    vi.advanceTimersByTime(MIN_THINKING_DWELL_MS);

    // 6. Transition to speaking final answer
    fsm.transitionTo("speaking", "final_answer_audio");
    expect(fsm.state).toBe("speaking");
    expect(fsm.previousState).toBe("thinking");
  });

  // BB-05: Transition to success (250ms crossfade) and automatic reset to idle after exactly 2000ms
  it("BB-05: Transition to success (250ms crossfade) and automatic reset to idle after exactly 2000ms", () => {
    fsm.transitionTo("speaking");
    events = [];

    fsm.transitionTo("success", "turn_complete");
    expect(fsm.state).toBe("success");
    expect(fsm.hasActiveAutoReset).toBe(true);

    expect(events).toHaveLength(1);
    expect(events[0].toState).toBe("success");
    expect(events[0].crossfadeDurationMs).toBe(250);
    expect(events[0].detail).toBe("turn_complete");

    // At 1999ms, still in success
    vi.advanceTimersByTime(1999);
    expect(fsm.state).toBe("success");
    expect(fsm.hasActiveAutoReset).toBe(true);

    // Exactly at 2000ms, auto-resets to idle
    vi.advanceTimersByTime(1);
    expect(fsm.state).toBe("idle");
    expect(fsm.hasActiveAutoReset).toBe(false);

    expect(events).toHaveLength(2);
    expect(events[1].fromState).toBe("success");
    expect(events[1].toState).toBe("idle");
    expect(events[1].detail).toBe("auto_reset_from_success");
  });

  // BB-06: Transition to terminal error (150ms fast crossfade) and automatic reset to idle after exactly 2500ms
  describe("BB-06: Transition to terminal error and auto-reset after 2500ms", () => {
    it("transitions with 150ms fast crossfade and auto-resets to idle after 2500ms", () => {
      fsm.transitionTo("thinking");
      events = [];

      fsm.transitionTo("error", "fatal_api_500");
      expect(fsm.state).toBe("error");
      expect(fsm.hasActiveAutoReset).toBe(true);

      expect(events).toHaveLength(1);
      expect(events[0].toState).toBe("error");
      expect(events[0].crossfadeDurationMs).toBe(150); // High priority preemption crossfade
      expect(events[0].detail).toBe("fatal_api_500");

      // At 2499ms, still in error
      vi.advanceTimersByTime(2499);
      expect(fsm.state).toBe("error");
      expect(fsm.hasActiveAutoReset).toBe(true);

      // At 2500ms, auto-resets to idle
      vi.advanceTimersByTime(1);
      expect(fsm.state).toBe("idle");
      expect(fsm.hasActiveAutoReset).toBe(false);

      expect(events).toHaveLength(2);
      expect(events[1].fromState).toBe("error");
      expect(events[1].toState).toBe("idle");
      expect(events[1].detail).toBe("auto_reset_from_error");
    });

    it("refreshes 2500ms auto-reset timer if error is re-triggered while in error", () => {
      fsm.transitionTo("error", "initial_error");
      expect(fsm.state).toBe("error");

      // Advance 1500ms
      vi.advanceTimersByTime(1500);

      // Re-trigger error
      fsm.transitionTo("error", "secondary_error");

      // Advance another 1500ms (3000ms total from initial error, but only 1500ms from secondary)
      vi.advanceTimersByTime(1500);
      expect(fsm.state).toBe("error");
      expect(fsm.hasActiveAutoReset).toBe(true);

      // Advance remaining 1000ms (to hit 2500ms from secondary error)
      vi.advanceTimersByTime(1000);
      expect(fsm.state).toBe("idle");
      expect(fsm.hasActiveAutoReset).toBe(false);
    });
  });

  // BB-07: Rapid preemption, debounce cancellation, cooldown interruption, and recoverable failover
  describe("BB-07: Rapid preemption and resilience", () => {
    it("cancels pending speaking debounce timer immediately if error preempts within 10ms", () => {
      fsm.transitionTo("thinking");
      vi.advanceTimersByTime(50);

      // Queue speaking transition (requires 250ms more dwell)
      fsm.transitionTo("speaking", "queued_audio");
      expect(fsm.isPendingDebounce).toBe(true);

      // 10ms later, fatal error strikes
      vi.advanceTimersByTime(10);
      fsm.transitionTo("error", "network_drop");

      expect(fsm.state).toBe("error");
      expect(fsm.isPendingDebounce).toBe(false);

      // Advance timers past the original 300ms dwell point
      vi.advanceTimersByTime(300);

      // Verify the queued speaking transition was completely obliterated
      expect(fsm.state).toBe("error");
      const statesEmitted = events.map((e) => e.toState);
      expect(statesEmitted).not.toContain("speaking");
    });

    it("cancels active auto-reset timer if new thinking turn begins mid-cooldown without premature idle reset", () => {
      fsm.transitionTo("success");
      expect(fsm.hasActiveAutoReset).toBe(true);

      // 500ms into the 2000ms cooldown, user sends a new prompt
      vi.advanceTimersByTime(500);
      fsm.transitionTo("thinking", "user_new_prompt");

      expect(fsm.state).toBe("thinking");
      expect(fsm.hasActiveAutoReset).toBe(false);

      // Advance another 2000ms (past the original success auto-reset expiration)
      vi.advanceTimersByTime(2000);

      // Must STILL be in thinking; must NOT have been pulled to idle!
      expect(fsm.state).toBe("thinking");
    });

    it("handles recoverable in-flight provider failover in thinking without resetting dwell or entering error", () => {
      fsm.transitionTo("thinking", "primary_provider_query");
      const initialEntryTimestamp = fsm.stateEntryTimestamp;

      // Primary provider fails with 429 after 200ms
      vi.advanceTimersByTime(200);

      // Failover occurs: remains in thinking with provider_failover detail
      fsm.transitionTo("thinking", "provider_failover");

      expect(fsm.state).toBe("thinking");
      expect(fsm.detail).toBe("provider_failover");
      // stateEntryTimestamp must be preserved to retain accumulated dwell time
      expect(fsm.stateEntryTimestamp).toBe(initialEntryTimestamp);

      // 100ms later (total 300ms from start of turn), fallback model answers
      vi.advanceTimersByTime(100);

      // Transition to speaking -> should execute immediately because 300ms dwell already elapsed!
      fsm.transitionTo("speaking", "fallback_answer");

      expect(fsm.state).toBe("speaking");
      expect(fsm.isPendingDebounce).toBe(false);
    });
  });

  // Teardown and Cleanup Verification
  describe("Teardown & Cleanup", () => {
    it("reset() immediately returns to idle and cancels active timers", () => {
      fsm.transitionTo("thinking");
      vi.advanceTimersByTime(50);
      fsm.transitionTo("speaking");
      expect(fsm.isPendingDebounce).toBe(true);

      fsm.reset();

      expect(fsm.state).toBe("idle");
      expect(fsm.isPendingDebounce).toBe(false);
      expect(fsm.hasActiveAutoReset).toBe(false);
    });

    it("dispose() cancels all active timers and clears subscriber listeners", () => {
      fsm.transitionTo("error", "fatal");
      expect(fsm.hasActiveAutoReset).toBe(true);

      fsm.dispose();

      expect(fsm.hasActiveAutoReset).toBe(false);
      expect(fsm.isPendingDebounce).toBe(false);

      // Future transitions should not notify detached listeners
      events = [];
      fsm.transitionTo("idle");
      expect(events).toHaveLength(0);
    });

    it("setPersona() updates active persona", () => {
      fsm.setPersona("sora");
      expect(fsm.persona).toBe("sora");

      fsm.transitionTo("thinking");
      expect(events.at(-1)?.persona).toBe("sora");
    });
  });
});
