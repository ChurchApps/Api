import { PayloadInterface } from "./Interfaces.js";
import WebSocket from "ws";
import { Repos } from "../repositories/index.js";
import { Connection } from "../models/index.js";
import { AttendanceInterface } from "./Interfaces.js";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { SocketHelper } from "./SocketHelper.js";
import { Environment } from "../../../shared/helpers/Environment.js";

export class DeliveryHelper {
  private static repos: Repos;
  private static awsClient: ApiGatewayManagementApiClient | null = null;
  private static awsEndpoint: string | null = null;

  static init(repos: Repos) {
    DeliveryHelper.repos = repos;
  }

  static sendConversationMessages = async (payload: PayloadInterface) => {
    const connections = DeliveryHelper.repos.connection.convertAllToModel(await DeliveryHelper.repos.connection.loadForConversation(payload.churchId, payload.conversationId));
    const results = await Promise.all(connections.map((connection) => DeliveryHelper.deliver(connection, payload)));
    if (results.includes("gone")) {
      DeliveryHelper.sendAttendance(payload.churchId, payload.conversationId).catch((e) => console.error("DeliveryHelper.sendAttendance failed:", e));
    }
  };

  static sendMessages = async (connections: Connection[], payload: PayloadInterface) => {
    const results = await Promise.all(connections.map((connection) => DeliveryHelper.deliver(connection, payload)));
    return results.filter((r) => r === "ok").length;
  };

  static sendMessage = async (connection: Connection, payload: PayloadInterface) => (await DeliveryHelper.deliver(connection, payload)) === "ok";

  // Only a gone socket loses its connection row; a slow or erroring one is kept for the next send.
  private static deliver = async (connection: Connection, payload: PayloadInterface): Promise<"ok" | "gone" | "error"> => {
    const result = Environment.deliveryProvider === "aws"
      ? await DeliveryHelper.sendAws(connection, payload)
      : ((await DeliveryHelper.sendLocal(connection, payload)) ? "ok" : "gone");
    if (result === "gone") await DeliveryHelper.repos.connection.delete(connection.churchId, connection.id);
    return result;
  };

  static sendAttendance = async (churchId: string, conversationId: string) => {
    const viewers = await DeliveryHelper.repos.connection.loadAttendance(churchId, conversationId);
    const totalViewers = viewers.length;
    const data: AttendanceInterface = { conversationId, viewers, totalViewers };
    await DeliveryHelper.sendConversationMessages({
      churchId,
      conversationId,
      action: "attendance",
      data
    });
  };

  static sendLocal = async (connection: Connection, payload: PayloadInterface) => {
    try {
      const sc = SocketHelper.getConnection(connection.socketId);
      if (sc && sc.socket.readyState === WebSocket.OPEN) {
        sc.socket.send(JSON.stringify(payload));
        return true;
      } else {
        // Connection mismatch: client's WS is on a different Api instance.
        const reason = !sc ? "not in local in-memory connections (likely client connected to a different WS endpoint)" : `readyState=${sc.socket.readyState}`;
        console.warn(`[DeliveryHelper.sendLocal] dropping ${payload.action} for socketId=${connection.socketId} room=${connection.conversationId} — ${reason}`);
        SocketHelper.deleteConnection(connection.socketId);
        return false;
      }
    } catch (e) {
      console.error(`[${connection.churchId}] DeliveryHelper.sendLocal error:`, e);
      return false;
    }
  };

  private static getApiGatewayEndpoint(): string | null {
    if (DeliveryHelper.awsEndpoint !== null) {
      return DeliveryHelper.awsEndpoint;
    }
    const apiGatewayId = process.env.WEBSOCKET_API_ID;
    const region = process.env.AWS_REGION || "us-east-2";
    const stage = process.env.STAGE || process.env.ENVIRONMENT || "dev";

    if (!apiGatewayId) {
      console.error("DeliveryHelper: WEBSOCKET_API_ID not available. WebSocket delivery disabled.");
      DeliveryHelper.awsEndpoint = "";
      return null;
    }

    DeliveryHelper.awsEndpoint = `https://${apiGatewayId}.execute-api.${region}.amazonaws.com/${stage}`;

    console.log(`DeliveryHelper: Using WebSocket endpoint: ${DeliveryHelper.awsEndpoint}`);
    return DeliveryHelper.awsEndpoint;
  }

  private static getAwsClient(): ApiGatewayManagementApiClient | null {
    const endpoint = DeliveryHelper.getApiGatewayEndpoint();
    if (!endpoint) return null;

    if (!DeliveryHelper.awsClient) {
      DeliveryHelper.awsClient = new ApiGatewayManagementApiClient({
        apiVersion: "2020-04-16",
        endpoint: endpoint
      });
    }
    return DeliveryHelper.awsClient;
  }

  static sendAws = async (connection: Connection, payload: PayloadInterface): Promise<"ok" | "gone" | "error"> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const client = DeliveryHelper.getAwsClient();
      if (!client) return "error";

      const command = new PostToConnectionCommand({
        ConnectionId: connection.socketId,
        Data: Buffer.from(JSON.stringify(payload))
      });

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("WebSocket delivery timeout")), 5000);
      });

      await Promise.race([client.send(command), timeoutPromise]);
      return "ok";
    } catch (e: any) {
      // GoneException (410): connection stale, expected.
      if (e.name === "GoneException" || e.$metadata?.httpStatusCode === 410) {
        return "gone";
      }
      if (e.message !== "WebSocket delivery timeout") {
        console.error(`[${connection.churchId}] DeliveryHelper.sendAws error:`, {
          name: e.name,
          message: e.message,
          code: e.code,
          statusCode: e.$metadata?.httpStatusCode,
          connectionId: connection.socketId
        });
      }
      return "error";
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  static sendBlockedIps = async (churchId: string, conversationId: string) => {
    const blockedIps = await DeliveryHelper.repos.blockedIp.loadByConversationId(churchId, conversationId);
    await DeliveryHelper.sendConversationMessages({
      churchId,
      conversationId,
      action: "blockedIp",
      data: blockedIps
    });
  };
}
