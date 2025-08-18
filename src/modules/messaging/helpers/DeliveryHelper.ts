import { PayloadInterface } from "./Interfaces";
import WebSocket from "ws";
import { MessagingRepositories } from "../repositories";
import { Connection } from "../models";
import { AttendanceInterface } from "./Interfaces";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { SocketHelper } from "./SocketHelper";
import { LoggingHelper } from "@churchapps/apihelper";
import { Environment } from "../../../shared/helpers/Environment";

export class DeliveryHelper {
  private static repositories: MessagingRepositories;

  static init(repositories: MessagingRepositories) {
    DeliveryHelper.repositories = repositories;
  }

  static sendConversationMessages = async (payload: PayloadInterface) => {
    const connections = DeliveryHelper.repositories.connection.convertAllToModel(
      await DeliveryHelper.repositories.connection.loadForConversation(payload.churchId, payload.conversationId)
    );
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
    if (!success) await DeliveryHelper.repositories.connection.delete(connection.churchId, connection.id);
    return success;
  };

  static sendAttendance = async (churchId: string, conversationId: string) => {
    const viewers = await DeliveryHelper.repositories.connection.loadAttendance(churchId, conversationId);
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
      LoggingHelper.getCurrent().error(`[${connection.churchId}] DeliveryHelper.sendLocal: ${e}`);
      return false;
    }
  };

  static sendAws = async (connection: Connection, payload: PayloadInterface) => {
    try {
      const gwManagement = new ApiGatewayManagementApiClient({
        apiVersion: "2020-04-16",
        endpoint: Environment.socketUrl
      });
      const command = new PostToConnectionCommand({
        ConnectionId: connection.socketId,
        Data: JSON.stringify(payload)
      });
      await gwManagement.send(command);
      return true;
    } catch (e) {
      LoggingHelper.getCurrent().error(`[${connection.churchId}] DeliveryHelper.sendAws: ${e}`);
      return false;
    }
  };

  static sendBlockedIps = async (churchId: string, conversationId: string) => {
    const blockedIps = await DeliveryHelper.repositories.blockedIp.loadByConversationId(churchId, conversationId);
    await DeliveryHelper.sendConversationMessages({
      churchId,
      conversationId,
      action: "blockedIp",
      data: blockedIps
    });
  };
}
