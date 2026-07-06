import { UniqueIdHelper } from "@churchapps/apihelper";
import type { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import { PayloadInterface, SocketConnectionInterface } from "./Interfaces.js";
import { Repos } from "../repositories/index.js";
import { Connection } from "../models/index.js";
import { DeliveryHelper } from "./DeliveryHelper.js";
import { Environment } from "../../../shared/helpers/Environment.js";

export class SocketHelper {
  private static wss: WebSocketServer = null;
  private static connections: SocketConnectionInterface[] = [];
  private static repos: Repos;
  private static heartbeatInterval: NodeJS.Timeout = null;
  private static readonly HEARTBEAT_MS = 30000;

  static init = (repos: Repos) => {
    SocketHelper.repos = repos;
    const port = Environment.websocketPort;
    console.log(`SocketHelper: Initializing with port ${port}, deliveryProvider: ${Environment.deliveryProvider}`);

    // When running on Railway (or any host that exposes a single port), the WebSocket server
    // is attached to the HTTP server in index.ts via attachToServer(). Skip the port-based path.
    if (process.env.RAILWAY_ENVIRONMENT) {
      console.log("WebSocket server will attach to HTTP server (Railway mode)");
      return;
    }

    // Only start WebSocket server in local development mode
    if (port > 0 && Environment.deliveryProvider === "local") {
      try {
        console.log(`Starting WebSocket server on port ${port}...`);
        SocketHelper.wss = new WebSocketServer({ port });
        SocketHelper.bindConnectionHandlers();
        console.log(`✓ WebSocket server started on port ${port}`);
      } catch (error) {
        console.warn(`⚠️ Failed to start WebSocket server on port ${port}:`, error.message);
        console.log("Continuing without WebSocket server...");
      }
    } else {
      console.log("WebSocket server not started (AWS mode or port disabled)");
    }
  };

  static attachToServer = (server: HttpServer) => {
    if (SocketHelper.wss) {
      console.log("WebSocket server already running; skipping attachToServer");
      return;
    }
    try {
      console.log("Attaching WebSocket server to HTTP listener...");
      SocketHelper.wss = new WebSocketServer({ server });
      SocketHelper.bindConnectionHandlers();
      console.log("✓ WebSocket server attached to HTTP listener");
    } catch (error) {
      console.warn("⚠️ Failed to attach WebSocket server:", (error as Error).message);
    }
  };

  private static bindConnectionHandlers = () => {
    SocketHelper.startHeartbeat();
    SocketHelper.wss.on("connection", (socket) => {
      const sc: SocketConnectionInterface = { id: UniqueIdHelper.shortId(), socket, isAlive: true };
      SocketHelper.connections.push(sc);

      // Browsers auto-reply to protocol-level pings; pong marks the socket live for the next sweep.
      sc.socket.on("pong", () => { sc.isAlive = true; });

      // Handle incoming messages - send socketId for ANY message
      sc.socket.on("message", (message) => {
        console.log(`Received message: ${message.toString()}`);
        const payload: PayloadInterface = { churchId: "", conversationId: "", action: "socketId", data: sc.id };
        sc.socket.send(JSON.stringify(payload));
      });

      sc.socket.on("close", async () => {
        SocketHelper.deleteConnection(sc.id);
        await SocketHelper.handleDisconnect(sc.id);
      });
    });
  };

  private static startHeartbeat = () => {
    if (SocketHelper.heartbeatInterval) return;
    SocketHelper.heartbeatInterval = setInterval(() => {
      SocketHelper.connections.slice().forEach((sc) => {
        if (sc.isAlive === false) {
          try { sc.socket.terminate(); } catch { /* already gone */ }
          SocketHelper.deleteConnection(sc.id);
          void SocketHelper.handleDisconnect(sc.id);
          return;
        }
        sc.isAlive = false;
        try { sc.socket.ping(); } catch { /* already gone */ }
      });
    }, SocketHelper.HEARTBEAT_MS);
  };

  static getLiveSocketIds = (): string[] => SocketHelper.connections.map((sc) => sc.id);

  static reapStaleConnections = async (repos: Repos) => {
    if (Environment.deliveryProvider === "local") {
      // Single-replica only: valid because the local WS path already assumes one process holds every live socket.
      await repos.connection.deleteStaleLocal(SocketHelper.getLiveSocketIds());
    } else {
      // API Gateway caps connections at ~2h, so a 24h TTL only reaps rows whose $disconnect was missed.
      await repos.connection.deleteStaleAws(24);
    }
  };

  static handleDisconnect = async (socketId: string) => {
    if (!SocketHelper.repos) return;

    try {
      const connections = await SocketHelper.repos.connection.loadBySocketId(socketId);
      await SocketHelper.repos.connection.deleteForSocket(socketId);
      connections.forEach((c: Connection) => {
        DeliveryHelper.sendAttendance(c.churchId, c.conversationId);
      });
    } catch (ex) {
      console.warn("SocketHelper.handleDisconnect error (non-fatal):", (ex as Error).message);
    }
  };

  static getConnection = (id: string) => {
    let result: SocketConnectionInterface = null;
    SocketHelper.connections.forEach((sc) => {
      if (sc.id === id) result = sc;
    });
    return result;
  };

  static deleteConnection = (id: string) => {
    for (let i = SocketHelper.connections.length - 1; i >= 0; i--) {
      const sc = SocketHelper.connections[i];
      if (sc.id === id) SocketHelper.connections.splice(i, 1);
    }
  };
  static shutdown = () => {
    if (SocketHelper.heartbeatInterval) {
      clearInterval(SocketHelper.heartbeatInterval);
      SocketHelper.heartbeatInterval = null;
    }
    if (SocketHelper.wss) {
      console.log("Shutting down WebSocket server...");
      SocketHelper.wss.close(() => {
        console.log("✅ WebSocket server closed");
      });
      SocketHelper.wss = null;
      SocketHelper.connections = [];
    }
  };
}
