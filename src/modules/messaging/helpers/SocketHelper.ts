import { UniqueIdHelper } from "@churchapps/apihelper";
import WebSocket from "ws";
import { PayloadInterface, SocketConnectionInterface } from "./Interfaces";
import { MessagingRepositories } from "../repositories";
import { Connection } from "../models";
import { DeliveryHelper } from "./DeliveryHelper";
import { Environment } from "../../../shared/helpers/Environment";

export class SocketHelper {
  private static wss: WebSocket.Server = null;
  private static connections: SocketConnectionInterface[] = [];
  private static repositories: MessagingRepositories;

  static init = (repositories: MessagingRepositories) => {
    SocketHelper.repositories = repositories;
    const port = Environment.websocketPort;
    console.log(`SocketHelper: Initializing with port ${port}, deliveryProvider: ${Environment.deliveryProvider}`);

    // Only start WebSocket server in local development mode
    if (port > 0 && Environment.deliveryProvider === "local") {
      try {
        console.log(`Starting WebSocket server on port ${port}...`);
        SocketHelper.wss = new WebSocket.Server({ port });

        SocketHelper.wss.on("connection", (socket) => {
          const sc: SocketConnectionInterface = { id: UniqueIdHelper.shortId(), socket };
          SocketHelper.connections.push(sc);

          // Handle incoming messages - send socketId for ANY message
          sc.socket.on("message", (message) => {
            console.log(`Received message: ${message.toString()}`);
            const payload: PayloadInterface = { churchId: "", conversationId: "", action: "socketId", data: sc.id };
            sc.socket.send(JSON.stringify(payload));
          });

          sc.socket.on("close", async () => {
            await SocketHelper.handleDisconnect(sc.id);
          });
        });
        console.log(`✓ WebSocket server started on port ${port}`);
      } catch (error) {
        console.warn(`⚠️ Failed to start WebSocket server on port ${port}:`, error.message);
        console.log("Continuing without WebSocket server...");
      }
    } else {
      console.log("WebSocket server not started (AWS mode or port disabled)");
    }
  };

  static handleDisconnect = async (socketId: string) => {
    if (!SocketHelper.repositories) return;

    const connections = await SocketHelper.repositories.connection.loadBySocketId(socketId);
    await SocketHelper.repositories.connection.deleteForSocket(socketId);
    connections.forEach((c: Connection) => {
      DeliveryHelper.sendAttendance(c.churchId, c.conversationId);
    });
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
