import { PayloadInterface } from "./Interfaces";
import WebSocket from "ws";
import { Repos } from "../repositories";
import { Connection } from "../models";
import { AttendanceInterface } from "./Interfaces";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { SocketHelper } from "./SocketHelper";
import { Environment } from "../../../shared/helpers/Environment";

export class DeliveryHelper {
  private static repos: Repos;

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

  private static getApiGatewayEndpoint(): string {
    // Construct endpoint from auto-detected/configured values
    const apiGatewayId = process.env.WEBSOCKET_API_ID;
    const region = process.env.AWS_REGION || "us-east-2";
    const stage = process.env.STAGE || process.env.ENVIRONMENT || "dev";

    if (!apiGatewayId) {
      console.error("DeliveryHelper: WEBSOCKET_API_ID not available. Ensure it's set via CloudFormation output or environment variable.");
      return "https://unconfigured-websocket-endpoint";
    }

    const stageName = stage.charAt(0).toUpperCase() + stage.slice(1);
    const endpoint = `https://${apiGatewayId}.execute-api.${region}.amazonaws.com/${stageName}`;

    console.log(`DeliveryHelper: Using WebSocket endpoint: ${endpoint}`);
    return endpoint;
  }

  static sendAws = async (connection: Connection, payload: PayloadInterface) => {
    try {
      const endpoint = DeliveryHelper.getApiGatewayEndpoint();
      const gwManagement = new ApiGatewayManagementApiClient({
        apiVersion: "2020-04-16",
        endpoint: endpoint
      });
      const command = new PostToConnectionCommand({
        ConnectionId: connection.socketId,
        Data: Buffer.from(JSON.stringify(payload))
      });
      await gwManagement.send(command);
      return true;
    } catch (e) {
      console.error(`[${connection.churchId}] DeliveryHelper.sendAws error:`, e);
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
