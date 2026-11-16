import { VisemeCue } from "./tts.js";
import {
  AvatarEventBroadcaster,
  getGlobalBroadcaster,
  VoiceEventPayload,
} from "./avatar/bridge/AvatarEventBroadcaster.js";
import { AvatarStatePayload, DEFAULT_BRIDGE_PORT } from "./avatar/types.js";

export const BRIDGE_PORT = DEFAULT_BRIDGE_PORT;

export type { VoiceEventPayload, VisemeCue };

export function hasConnectedClients(): boolean {
  return getGlobalBroadcaster().hasConnectedClients();
}

export function broadcastSpeakEvent(payload: VoiceEventPayload): void {
  getGlobalBroadcaster().broadcastSpeakEvent(payload);
}

export function broadcastPersonaEvent(persona: string): void {
  getGlobalBroadcaster().broadcastPersonaEvent(persona);
}

export function broadcastAvatarState(payload: AvatarStatePayload): void {
  getGlobalBroadcaster().broadcastState(payload);
}

export function startBridgeServer(port = BRIDGE_PORT): Promise<boolean> {
  return getGlobalBroadcaster().start(port);
}

export function stopBridgeServer(): void {
  getGlobalBroadcaster().close();
}

export function getBridgeBroadcaster(): AvatarEventBroadcaster {
  return getGlobalBroadcaster();
}
