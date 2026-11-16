import { z } from "zod";

/**
 * The 6 deterministic states of the 3D reactive avatar Finite State Machine (FSM):
 * - 1 base state: idle
 * - 5 reactive AI states: thinking, speaking, executing, success, error
 */
export const AVATAR_INTERACTION_STATES = [
  "idle",
  "thinking",
  "speaking",
  "executing",
  "success",
  "error",
] as const;

export type AvatarInteractionState = (typeof AVATAR_INTERACTION_STATES)[number];

/** Shorthand alias for AvatarInteractionState */
export type AvatarState = AvatarInteractionState;

export const AvatarInteractionStateSchema = z.enum(AVATAR_INTERACTION_STATES);
export const AvatarStateSchema = AvatarInteractionStateSchema;

/**
 * Valid Persona IDs supported in Elenalyse.
 */
export const PERSONA_IDS = ["eli", "rei", "sora", "rin"] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];
export const PersonaIdSchema = z.enum(PERSONA_IDS);

export const PERSONA_MODEL_MAP: Record<PersonaId, string> = {
  eli: "/models/ELI_Model.vrm",
  rei: "/models/REI_Model.vrm",
  sora: "/models/ELI_Model.vrm", // Fallback to ELI
  rin: "/models/REI_Model.vrm",  // Fallback to REI
};

export function resolveModelPath(persona: PersonaId): string {
  return PERSONA_MODEL_MAP[persona] || "/models/ELI_Model.vrm";
}

export function shouldReloadModel(
  currentPersona: PersonaId,
  nextPersona: PersonaId
): boolean {
  return resolveModelPath(currentPersona) !== resolveModelPath(nextPersona);
}

/**
 * Standard SSE payload broadcasted by the CLI bridge and consumed by the Tauri desktop overlay.
 */
export interface AvatarStatePayload {
  /** Literal event identifier indicating a state transition */
  event: "state_change";
  /** The active or target avatar state */
  state: AvatarInteractionState;
  /** Active persona emitting the state event */
  persona: PersonaId;
  /** Optional contextual detail (e.g. tool name, step info, or provider failover status) */
  detail?: string;
  /** Unix timestamp (milliseconds) when the state event was emitted */
  timestamp: number;
}

export const AvatarStatePayloadSchema = z.object({
  event: z.literal("state_change"),
  state: AvatarInteractionStateSchema,
  persona: PersonaIdSchema,
  detail: z.string().optional(),
  timestamp: z.number().int().positive(),
});

/**
 * Configuration options governing each avatar state's animation, looping, and transitions.
 */
export interface StateConfig {
  /** Whether the associated VRM animation/pose loops indefinitely */
  loop: boolean;
  /** Crossfade duration in milliseconds between VRM animations/expressions */
  crossfadeDurationMs: number;
  /** Optional auto-reset timer in milliseconds before transitioning back to 'idle' */
  autoResetMs?: number;
  /** Priority level (higher priority states preempt lower priority ones) */
  priority: number;
}

export const StateConfigSchema = z.object({
  loop: z.boolean(),
  crossfadeDurationMs: z.number().int().nonnegative(),
  autoResetMs: z.number().int().positive().optional(),
  priority: z.number().int().nonnegative(),
});

/**
 * Minimum dwell duration (in milliseconds) the avatar must stay in 'thinking'
 * to avoid visual flicker during ultra-fast tool execution or cached LLM queries.
 */
export const MIN_THINKING_DWELL_MS = 300;

/**
 * Standard SSE event name broadcasted to EventSource clients on the bridge.
 */
export const AVATAR_SSE_EVENT = "avatar:state";

/**
 * Secondary alias SSE event name for shorthand listeners.
 */
export const AVATAR_STATE_ALIAS_EVENT = "state";

/**
 * Default bridge port shared between CLI and Desktop overlay.
 */
export const DEFAULT_BRIDGE_PORT = 39420;

/**
 * Deterministic configuration for each avatar state.
 */
export const STATE_CONFIGS: Record<AvatarInteractionState, StateConfig> = {
  idle: {
    loop: true,
    crossfadeDurationMs: 250,
    priority: 0,
  },
  thinking: {
    loop: true,
    crossfadeDurationMs: 250,
    priority: 1,
  },
  speaking: {
    loop: true,
    crossfadeDurationMs: 250,
    priority: 2,
  },
  executing: {
    loop: true,
    crossfadeDurationMs: 250,
    priority: 2,
  },
  success: {
    loop: false,
    crossfadeDurationMs: 250,
    autoResetMs: 2000,
    priority: 3,
  },
  error: {
    loop: false,
    crossfadeDurationMs: 150,
    autoResetMs: 2500,
    priority: 99,
  },
};

/**
 * Allowed transition matrix defining valid target states from each source state.
 */
export const ALLOWED_TRANSITIONS: Record<AvatarInteractionState, readonly AvatarInteractionState[]> = {
  idle: ["thinking", "executing", "error"],
  thinking: ["executing", "speaking", "success", "idle", "error"],
  executing: ["thinking", "speaking", "success", "idle", "error"],
  speaking: ["idle", "success", "thinking", "executing", "error"],
  success: ["idle", "thinking", "error"],
  error: ["idle", "thinking"],
};

/**
 * Type guard checking if an arbitrary string is a valid AvatarInteractionState.
 */
export function isAvatarState(value: unknown): value is AvatarInteractionState {
  return typeof value === "string" && (AVATAR_INTERACTION_STATES as readonly string[]).includes(value);
}

/**
 * Validates whether a state transition from `from` to `to` is legally permitted.
 */
export function canTransition(from: AvatarInteractionState, to: AvatarInteractionState): boolean {
  if (from === to) return true; // Re-entrant updates allowed
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Checks if a payload signifies an in-flight recoverable failover (should remain in thinking state).
 */
export function isRecoverableFailover(payload: AvatarStatePayload): boolean {
  return (
    payload.state === "thinking" &&
    payload.detail === "provider_failover"
  );
}

/**
 * Checks if a payload signifies a terminal error (triggers preemption and auto-reset to idle).
 */
export function isTerminalError(payload: AvatarStatePayload): boolean {
  return payload.state === "error";
}

/**
 * Factory helper to construct a properly typed AvatarStatePayload.
 */
export function createStatePayload(
  state: AvatarInteractionState,
  persona: PersonaId,
  options?: {
    detail?: string;
    timestamp?: number;
  }
): AvatarStatePayload {
  return {
    event: "state_change",
    state,
    persona,
    detail: options?.detail,
    timestamp: options?.timestamp ?? Date.now(),
  };
}
