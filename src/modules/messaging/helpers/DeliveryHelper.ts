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
    const deliveryCount = await this.sendMessages(connections, payload);
    if (deliveryCount !== connections.length) DeliveryHelper.sendAttendance(payload.churchId, payload.conversationId);
  };

  static sendMessages = async (connections: Connection[], payload: PayloadInterface) => {
    const promises: Promise<boolean>[] = [];
    connections.forEach((connection) => {
      promises.push(DeliveryHelper.sendMessage(connection, payload));
    });
    const results = await Promise.all(promises);
    let deliveryCount = 0;
    results.forEach((r) => {
      if (r) deliveryCount++;
    });
    return deliveryCount;
  };

  static sendMessage = async (connection: Connection, payload: PayloadInterface) => {
    let success = true;
    if (Environment.deliveryProvider === "aws") success = await DeliveryHelper.sendAws(connection, payload);
    else success = await DeliveryHelper.sendLocal(connection, payload);
    if (!success) await DeliveryHelper.repos.connection.delete(connection.churchId, connection.id);
    return success;
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
        SocketHelper.deleteConnection(connection.socketId);
        return false;
      }
    } catch (e) {
      throw new Error(`[${connection.churchId}] DeliveryHelper.sendLocal: ${e}`);
    }
  };

  private static getApiGatewayEndpoint(): string | null {
    // Return cached endpoint if available
    if (DeliveryHelper.awsEndpoint !== null) {
      return DeliveryHelper.awsEndpoint;
    }

    // Construct endpoint from auto-detected/configured values
    const apiGatewayId = process.env.WEBSOCKET_API_ID;
    const region = process.env.AWS_REGION || "us-east-2";
    const stage = process.env.STAGE || process.env.ENVIRONMENT || "dev";

    if (!apiGatewayId) {
      console.error("DeliveryHelper: WEBSOCKET_API_ID not available. WebSocket delivery disabled.");
      DeliveryHelper.awsEndpoint = ""; // Cache empty string to avoid repeated lookups
      return null;
    }

    // Use stage name as-is (lowercase) to match WebSocket API Gateway stage
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

  static sendAws = async (connection: Connection, payload: PayloadInterface) => {
    try {
      const client = DeliveryHelper.getAwsClient();
      if (!client) {
        // No WebSocket endpoint configured - skip delivery silently
        return false;
      }

      const command = new PostToConnectionCommand({
        ConnectionId: connection.socketId,
        Data: Buffer.from(JSON.stringify(payload))
      });

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("WebSocket delivery timeout")), 5000);
      });

      await Promise.race([client.send(command), timeoutPromise]);
      return true;
    } catch (e: any) {
      // GoneException means connection is stale - this is expected, don't log as error
      if (e.name === "GoneException" || e.$metadata?.httpStatusCode === 410) {
        return false;
      }
      // Log detailed error info for debugging
      console.error(`[${connection.churchId}] DeliveryHelper.sendAws error:`, {
        name: e.name,
        message: e.message,
        code: e.code,
        statusCode: e.$metadata?.httpStatusCode,
        connectionId: connection.socketId,
        endpoint: DeliveryHelper.awsEndpoint
      });
      return false;
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
