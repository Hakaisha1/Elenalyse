import {
  AvatarInteractionState,
  PersonaId,
  MIN_THINKING_DWELL_MS,
  STATE_CONFIGS,
} from "../types.js";

/**
 * Event emitted to subscribers whenever a valid state transition occurs.
 */
export interface StateTransitionEvent {
  fromState: AvatarInteractionState | null;
  toState: AvatarInteractionState;
  persona: PersonaId;
  crossfadeDurationMs: number;
  detail?: string;
  timestamp: number;
}

export type StateTransitionListener = (event: StateTransitionEvent) => void;

export interface TransitionOptions {
  detail?: string;
  persona?: PersonaId;
  force?: boolean;
}

/**
 * Deterministic, renderer-agnostic Finite State Machine managing 3D avatar states.
 * Enforces transition rules, dwell debounce times, auto-reset timers, and preemption.
 */
export class ReactiveAvatarFSM {
  private _state: AvatarInteractionState = "idle";
  private _previousState: AvatarInteractionState | null = null;
  private _persona: PersonaId = "eli";
  private _detail?: string;
  private _stateEntryTimestamp: number = Date.now();
  private _pendingDebounceTimer: NodeJS.Timeout | null = null;
  private _autoResetTimer: NodeJS.Timeout | null = null;
  private _listeners: StateTransitionListener[] = [];

  constructor(initialPersona: PersonaId = "eli", initialTimestamp: number = Date.now()) {
    this._persona = initialPersona;
    this._stateEntryTimestamp = initialTimestamp;
  }

  /** Current active avatar state */
  public get state(): AvatarInteractionState {
    return this._state;
  }

  /** Immediately preceding avatar state, or null if initial */
  public get previousState(): AvatarInteractionState | null {
    return this._previousState;
  }

  /** Currently active persona */
  public get persona(): PersonaId {
    return this._persona;
  }

  /** Contextual detail string associated with current state */
  public get detail(): string | undefined {
    return this._detail;
  }

  /** Timestamp (ms) when current state was entered */
  public get stateEntryTimestamp(): number {
    return this._stateEntryTimestamp;
  }

  /** True if a dwell debounce timer is currently waiting to execute a state transition */
  public get isPendingDebounce(): boolean {
    return this._pendingDebounceTimer !== null;
  }

  /** True if an auto-reset timer (from success or error) is currently active */
  public get hasActiveAutoReset(): boolean {
    return this._autoResetTimer !== null;
  }

  /**
   * Set or switch active persona.
   */
  public setPersona(persona: PersonaId): void {
    this._persona = persona;
  }

  /**
   * Subscribe to state transition events.
   * Returns an unsubscribe function.
   */
  public subscribe(listener: StateTransitionListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  /** Alias for subscribe */
  public on(listener: StateTransitionListener): () => void {
    return this.subscribe(listener);
  }

  /**
   * Request a transition to a target avatar interaction state.
   */
  public transitionTo(
    targetState: AvatarInteractionState,
    detailOrOptions?: string | TransitionOptions,
    explicitPersona?: PersonaId
  ): boolean {
    let detail: string | undefined;
    let persona: PersonaId | undefined = explicitPersona;

    if (typeof detailOrOptions === "string") {
      detail = detailOrOptions;
    } else if (detailOrOptions && typeof detailOrOptions === "object") {
      detail = detailOrOptions.detail;
      if (detailOrOptions.persona) {
        persona = detailOrOptions.persona;
      }
    }

    const targetPersona = persona ?? this._persona;

    // Rule: Re-triggering thinking while already in thinking (e.g. provider failover)
    if (this._state === "thinking" && targetState === "thinking") {
      this._cancelPendingDebounce();
      this._detail = detail;
      if (persona) this._persona = persona;

      // Retain original stateEntryTimestamp for dwell calculation; notify listeners of detail update
      this._notifyListeners({
        fromState: "thinking",
        toState: "thinking",
        persona: this._persona,
        crossfadeDurationMs: STATE_CONFIGS.thinking.crossfadeDurationMs,
        detail: this._detail,
        timestamp: Date.now(),
      });
      return true;
    }

    // Rule: Re-triggering error while already in error -> refresh the 2500ms auto-reset timer
    if (this._state === "error" && targetState === "error") {
      this._cancelPendingDebounce();
      this._clearAutoResetTimer();
      this._detail = detail;
      if (persona) this._persona = persona;

      this._scheduleAutoReset("error", STATE_CONFIGS.error.autoResetMs ?? 2500);

      this._notifyListeners({
        fromState: "error",
        toState: "error",
        persona: this._persona,
        crossfadeDurationMs: STATE_CONFIGS.error.crossfadeDurationMs,
        detail: this._detail,
        timestamp: Date.now(),
      });
      return true;
    }

    // Cancel pending thinking -> speaking debounce timer if ANY new state arrives
    this._cancelPendingDebounce();

    // Cancel active auto-reset timer if transitioning away from success or error
    if (this._state === "success" || this._state === "error") {
      this._clearAutoResetTimer();
    }

    // Rule: thinking -> speaking enforces MIN_THINKING_DWELL_MS (300ms) anti-flicker guard
    if (this._state === "thinking" && targetState === "speaking") {
      const elapsedDwell = Date.now() - this._stateEntryTimestamp;

      if (elapsedDwell < MIN_THINKING_DWELL_MS) {
        const remainingDelay = Math.max(0, MIN_THINKING_DWELL_MS - elapsedDwell);
        this._pendingDebounceTimer = setTimeout(() => {
          this._pendingDebounceTimer = null;
          this._applyTransition("speaking", detail, targetPersona);
        }, remainingDelay);
        return true;
      }
    }

    // Standard immediate transition
    this._applyTransition(targetState, detail, targetPersona);
    return true;
  }

  /**
   * Internal transition executor.
   */
  private _applyTransition(
    targetState: AvatarInteractionState,
    detail?: string,
    persona?: PersonaId
  ): void {
    const fromState = this._state;
    this._previousState = fromState;
    this._state = targetState;
    this._detail = detail;
    if (persona) {
      this._persona = persona;
    }
    this._stateEntryTimestamp = Date.now();

    const config = STATE_CONFIGS[targetState];
    // Crossfade duration: 150ms when target is error (priority 99 preemption), 250ms for all other transitions
    const crossfadeDurationMs = targetState === "error" ? 150 : config.crossfadeDurationMs;

    // Schedule auto-reset timers if applicable
    if (targetState === "success") {
      this._scheduleAutoReset("success", config.autoResetMs ?? 2000);
    } else if (targetState === "error") {
      this._scheduleAutoReset("error", config.autoResetMs ?? 2500);
    }

    this._notifyListeners({
      fromState,
      toState: targetState,
      persona: this._persona,
      crossfadeDurationMs,
      detail: this._detail,
      timestamp: this._stateEntryTimestamp,
    });
  }

  private _scheduleAutoReset(sourceState: "success" | "error", durationMs: number): void {
    this._clearAutoResetTimer();
    this._autoResetTimer = setTimeout(() => {
      this._autoResetTimer = null;
      if (this._state === sourceState) {
        this.transitionTo("idle", {
          detail: `auto_reset_from_${sourceState}`,
        });
      }
    }, durationMs);
  }

  private _cancelPendingDebounce(): void {
    if (this._pendingDebounceTimer !== null) {
      clearTimeout(this._pendingDebounceTimer);
      this._pendingDebounceTimer = null;
    }
  }

  private _clearAutoResetTimer(): void {
    if (this._autoResetTimer !== null) {
      clearTimeout(this._autoResetTimer);
      this._autoResetTimer = null;
    }
  }

  private _notifyListeners(event: StateTransitionEvent): void {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[ReactiveAvatarFSM] Listener error:", err);
      }
    }
  }

  /**
   * Immediate reset to 'idle' state; cancels all pending timers.
   */
  public reset(): void {
    this._cancelPendingDebounce();
    this._clearAutoResetTimer();

    if (this._state !== "idle") {
      this._applyTransition("idle", "reset");
    } else {
      this._stateEntryTimestamp = Date.now();
      this._detail = undefined;
    }
  }

  /**
   * Disposes the FSM controller, cancelling all active timers and detaching all listeners.
   */
  public dispose(): void {
    this._cancelPendingDebounce();
    this._clearAutoResetTimer();
    this._listeners = [];
  }
}
