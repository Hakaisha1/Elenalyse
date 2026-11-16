import { ReactiveAvatarFSM } from "./fsm/ReactiveAvatarFSM.js";
import {
  AvatarEventBroadcaster,
  getGlobalBroadcaster,
} from "./bridge/AvatarEventBroadcaster.js";
import {
  AvatarInteractionState,
  PersonaId,
  PERSONA_IDS,
} from "./types.js";

let globalFsm: ReactiveAvatarFSM | null = null;
let isInitialized = false;

export interface EmitAvatarStateOptions {
  detail?: string;
  persona?: PersonaId;
  immediate?: boolean;
}

/**
 * Access the unified singleton avatar runtime containing the FSM and SSE broadcaster.
 */
export function getGlobalAvatarRuntime(): {
  fsm: ReactiveAvatarFSM;
  broadcaster: AvatarEventBroadcaster;
} {
  const broadcaster = getGlobalBroadcaster();

  if (!globalFsm) {
    globalFsm = new ReactiveAvatarFSM("eli");
    broadcaster.attachFSM(globalFsm);
    isInitialized = true;
  } else if (!isInitialized) {
    broadcaster.attachFSM(globalFsm);
    isInitialized = true;
  }

  return {
    fsm: globalFsm,
    broadcaster,
  };
}

/**
 * Emit an avatar state transition into the global FSM, which automatically
 * broadcasts the transition to all connected desktop companions over the bridge.
 */
export function emitAvatarState(
  state: AvatarInteractionState,
  options?: EmitAvatarStateOptions
): boolean {
  const { fsm } = getGlobalAvatarRuntime();
  return fsm.transitionTo(state, {
    detail: options?.detail,
    persona: options?.persona,
  });
}

/**
 * Synchronize the active persona across both the FSM and the SSE bridge broadcaster.
 */
export function syncAvatarPersona(persona: string): void {
  const lower = persona.toLowerCase() as PersonaId;
  const { fsm, broadcaster } = getGlobalAvatarRuntime();

  if ((PERSONA_IDS as readonly string[]).includes(lower)) {
    fsm.setPersona(lower);
  }
  broadcaster.broadcastPersonaEvent(persona);
}

/**
 * Reset the global avatar runtime back to initial idle state and detach/reset timers.
 */
export function resetAvatarRuntime(): void {
  if (globalFsm) {
    globalFsm.reset();
  }
}
