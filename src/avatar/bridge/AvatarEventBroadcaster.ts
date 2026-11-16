import http from "http";
import {
  AvatarInteractionState,
  AvatarStatePayload,
  DEFAULT_BRIDGE_PORT,
  PersonaId,
  createStatePayload,
  AVATAR_SSE_EVENT,
  AVATAR_STATE_ALIAS_EVENT,
} from "../types.js";
import { ReactiveAvatarFSM } from "../fsm/ReactiveAvatarFSM.js";

export interface VisemeCueLike {
  time: number;
  duration: number;
  vowel: string | null;
  text?: string;
}

export interface VoiceEventPayload {
  id: string;
  persona: string;
  emotion?: string;
  text: string;
  audioBase64: string;
  cues: VisemeCueLike[];
  totalDuration: number;
}

export interface BroadcasterOptions {
  port?: number;
  fsm?: ReactiveAvatarFSM;
  initialPersona?: PersonaId;
}

/**
 * Non-blocking, single-port HTTP/SSE broadcaster on 127.0.0.1:39420.
 * Bridges CLI execution events to the Tauri desktop companion overlay.
 */
export class AvatarEventBroadcaster {
  private _port: number;
  private _server: http.Server | null = null;
  private _clients: Set<http.ServerResponse> = new Set();
  private _heartbeatTimer: NodeJS.Timeout | null = null;
  private _fsm: ReactiveAvatarFSM | null = null;
  private _unsubscribeFsm: (() => void) | null = null;
  private _currentPayload: AvatarStatePayload;
  private _isListening = false;

  constructor(options?: BroadcasterOptions) {
    this._port = options?.port ?? DEFAULT_BRIDGE_PORT;
    const initialPersona = options?.initialPersona ?? options?.fsm?.persona ?? "eli";
    this._currentPayload = createStatePayload("idle", initialPersona);

    if (options?.fsm) {
      this.attachFSM(options.fsm);
    }
  }

  public get port(): number {
    return this._port;
  }

  public get isListening(): boolean {
    return this._isListening;
  }

  public get connectedClientsCount(): number {
    return this._clients.size;
  }

  public hasConnectedClients(): boolean {
    return this._clients.size > 0;
  }

  public getCurrentPayload(): AvatarStatePayload {
    return { ...this._currentPayload };
  }

  /**
   * Attach to a ReactiveAvatarFSM instance to automatically broadcast state transitions.
   */
  public attachFSM(fsm: ReactiveAvatarFSM): void {
    this.detachFSM();
    this._fsm = fsm;
    this._currentPayload = {
      event: "state_change",
      state: fsm.state,
      persona: fsm.persona,
      detail: fsm.detail,
      timestamp: fsm.stateEntryTimestamp,
    };

    this._unsubscribeFsm = fsm.subscribe((evt) => {
      const payload: AvatarStatePayload = {
        event: "state_change",
        state: evt.toState,
        persona: evt.persona,
        detail: evt.detail,
        timestamp: evt.timestamp,
      };
      this.broadcastState(payload);
    });
  }

  /**
   * Detach from current FSM.
   */
  public detachFSM(): void {
    if (this._unsubscribeFsm) {
      this._unsubscribeFsm();
      this._unsubscribeFsm = null;
    }
    this._fsm = null;
  }

  /**
   * Broadcast an AvatarStatePayload to all connected SSE clients.
   */
  public broadcastState(payload: AvatarStatePayload): void {
    this._currentPayload = { ...payload };

    if (this._clients.size === 0) return;

    const data = JSON.stringify(payload);
    // Broadcast on both avatar:state and alias state channels
    const sseMessage = `event: ${AVATAR_SSE_EVENT}\ndata: ${data}\n\nevent: ${AVATAR_STATE_ALIAS_EVENT}\ndata: ${data}\n\n`;

    for (const client of this._clients) {
      try {
        client.write(sseMessage);
      } catch {
        this._clients.delete(client);
      }
    }
  }

  /**
   * Manually dispatch a state transition (convenience helper).
   */
  public transitionState(
    state: AvatarInteractionState,
    detail?: string,
    persona?: PersonaId
  ): void {
    if (this._fsm) {
      this._fsm.transitionTo(state, { detail, persona });
    } else {
      const targetPersona = persona ?? this._currentPayload.persona;
      const payload = createStatePayload(state, targetPersona, { detail });
      this.broadcastState(payload);
    }
  }

  /**
   * Broadcast speech audio payload for lip-sync and voice playback.
   */
  public broadcastSpeakEvent(payload: VoiceEventPayload): void {
    if (this._clients.size === 0) return;
    const message = `event: speak\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this._clients) {
      try {
        client.write(message);
      } catch {
        this._clients.delete(client);
      }
    }
  }

  /**
   * Broadcast persona change event.
   */
  public broadcastPersonaEvent(persona: string): void {
    const validPersona = persona.toLowerCase() as PersonaId;
    if (["eli", "rei", "sora", "rin"].includes(validPersona)) {
      this._currentPayload.persona = validPersona;
      if (this._fsm) {
        this._fsm.setPersona(validPersona);
      }
    }

    if (this._clients.size === 0) return;
    const message = `event: persona\ndata: ${JSON.stringify({ persona })}\n\n`;
    for (const client of this._clients) {
      try {
        client.write(message);
      } catch {
        this._clients.delete(client);
      }
    }
  }

  /**
   * Starts the HTTP/SSE bridge server. Returns true if listening, false if port is in use.
   */
  public start(port?: number): Promise<boolean> {
    if (this._server && this._isListening) {
      return Promise.resolve(true);
    }

    const listenPort = port ?? this._port;
    this._port = listenPort;

    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        // Permissive CORS for Tauri desktop webview
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        // GET /health
        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "ok",
              connectedClients: this._clients.size,
              state: this._currentPayload.state,
              persona: this._currentPayload.persona,
            })
          );
          return;
        }

        // GET /state
        if (req.url === "/state") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(this.getCurrentPayload()));
          return;
        }

        // GET /events (SSE Channel)
        if (req.url === "/events") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          });

          // 1. Initial connection handshake
          res.write(
            `event: connected\ndata: ${JSON.stringify({
              connectedClients: this._clients.size + 1,
            })}\n\n`
          );

          // 2. Initial state snapshot
          const snapshotJson = JSON.stringify(this.getCurrentPayload());
          res.write(
            `event: ${AVATAR_SSE_EVENT}\ndata: ${snapshotJson}\n\nevent: ${AVATAR_STATE_ALIAS_EVENT}\ndata: ${snapshotJson}\n\n`
          );

          this._clients.add(res);

          req.on("close", () => {
            this._clients.delete(res);
          });
          return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      });

      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          // Port already in use by another Elenalyse CLI session; handle gracefully
          this._server = null;
          this._isListening = false;
          resolve(false);
        } else {
          console.error("[AvatarEventBroadcaster Error]", err.message);
          this._server = null;
          this._isListening = false;
          resolve(false);
        }
      });

      server.listen(listenPort, "127.0.0.1", () => {
        this._server = server;
        this._isListening = true;

        // unref server socket so Node does not hang on process exit
        server.unref();

        // 15-second heartbeat ping to prevent EventSource timeout
        this._heartbeatTimer = setInterval(() => {
          if (this._clients.size > 0) {
            for (const client of this._clients) {
              try {
                client.write(": ping\n\n");
              } catch {
                this._clients.delete(client);
              }
            }
          }
        }, 15000);

        // unref heartbeat interval so CLI commands exit immediately
        this._heartbeatTimer.unref();

        resolve(true);
      });
    });
  }

  /**
   * Stop the bridge server and disconnect all clients cleanly.
   */
  public close(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    for (const client of this._clients) {
      try {
        client.end();
      } catch {}
    }
    this._clients.clear();

    if (this._server) {
      try {
        this._server.close();
      } catch {}
      this._server = null;
    }

    this._isListening = false;
    this.detachFSM();
  }

  /** Alias for close */
  public dispose(): void {
    this.close();
  }
}

let globalBroadcaster: AvatarEventBroadcaster | null = null;

/**
 * Access the shared global singleton broadcaster instance.
 */
export function getGlobalBroadcaster(): AvatarEventBroadcaster {
  if (!globalBroadcaster) {
    globalBroadcaster = new AvatarEventBroadcaster();
  }
  return globalBroadcaster;
}

/**
 * Reset or set the global broadcaster instance (primarily for testing).
 */
export function setGlobalBroadcaster(broadcaster: AvatarEventBroadcaster | null): void {
  globalBroadcaster = broadcaster;
}
