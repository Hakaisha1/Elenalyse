import http from "http";
import { VisemeCue } from "./tts.js";

export const BRIDGE_PORT = 39420;

export interface VoiceEventPayload {
  id: string;
  persona: string;
  emotion?: string;
  text: string;
  audioBase64: string;
  cues: VisemeCue[];
  totalDuration: number;
}

let server: http.Server | null = null;
const clients = new Set<http.ServerResponse>();
let heartbeatTimer: NodeJS.Timeout | null = null;

export function hasConnectedClients(): boolean {
  return clients.size > 0;
}

export function broadcastSpeakEvent(payload: VoiceEventPayload): void {
  if (clients.size === 0) return;
  const message = `event: speak\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }
}

export function broadcastPersonaEvent(persona: string): void {
  if (clients.size === 0) return;
  const message = `event: persona\ndata: ${JSON.stringify({ persona })}\n\n`;
  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }
}

export function startBridgeServer(port = BRIDGE_PORT): Promise<boolean> {
  if (server) return Promise.resolve(true);

  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      // Set permissive CORS headers for Desktop Webview
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", connectedClients: clients.size }));
        return;
      }

      if (req.url === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });

        // Kirim initial connection handshake
        res.write(`event: connected\ndata: ${JSON.stringify({ connectedClients: clients.size + 1 })}\n\n`);
        clients.add(res);

        req.on("close", () => {
          clients.delete(res);
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        // Port sudah dipakai oleh sesi CLI lain, abaikan agar tidak crash
        server = null;
        resolve(false);
      } else {
        console.error("[Bridge Error]", err.message);
        resolve(false);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      // Heartbeat ping setiap 15 detik agar koneksi SSE tidak timeout
      heartbeatTimer = setInterval(() => {
        if (clients.size > 0) {
          for (const client of clients) {
            try {
              client.write(`: ping\n\n`);
            } catch {
              clients.delete(client);
            }
          }
        }
      }, 15000);
      resolve(true);
    });
  });
}

export function stopBridgeServer(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  for (const client of clients) {
    try {
      client.end();
    } catch {}
  }
  clients.clear();

  if (server) {
    server.close();
    server = null;
  }
}
