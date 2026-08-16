import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Connection } from "../models/index.js";
import { DeliveryHelper } from "../helpers/DeliveryHelper.js";

@controller("/messaging/connections")
export class ConnectionController extends MessagingBaseController {
  private async updateAnonName(connection: Connection) {
    if (connection.displayName === "Anonymous ") {
      const connections: Connection[] = await this.repos.connection.loadForConversation(connection.churchId, connection.conversationId);
      const numbers = connections
        .filter((c) => c.displayName.includes("Anonymous"))
        .map((c) => Number(c.displayName.split("_")[1]))
        .filter((n) => !Number.isNaN(n));
      const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
      connection.displayName = `Anonymous_${maxNumber + 1}`;
    }
  }

  @httpGet("/:churchId/:conversationId")
  public async load(@requestParam("churchId") churchId: string, @requestParam("conversationId") conversationId: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      if (!(await this.canAccessConnection(churchId, conversationId))) return this.json([], 401);
      const data = await this.repos.connection.loadForConversation(churchId, conversationId);
      const connections = this.repos.connection.convertAllToModel(data);
      return connections;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Connection[]>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const au = this.authUser();
      const promises: Promise<Connection>[] = [];
      for (const connection of req.body) {
        const convData = connection.conversationId ? await this.repos.conversation.loadByIdOnly(connection.conversationId) : null;
        const conv = convData ? this.repos.conversation.convertToModel(convData) : null;
        if (conv && this.isAnonPublicConversation(conv)) connection.churchId = conv.churchId;
        else if (au && conv && au.churchId === conv.churchId) connection.churchId = conv.churchId;
        else return this.json({}, 401);
        if (connection.personId === undefined) connection.personId = null;
        await this.updateAnonName(connection);
        promises.push(
          this.repos.connection
            .save(connection)
            .then(async (c) => {
              await DeliveryHelper.sendAttendance(c.churchId, c.conversationId);
              await DeliveryHelper.sendBlockedIps(c.churchId, c.conversationId);
              return c;
            })
            .catch((error) => {
              console.error("❌ Failed to save connection:", error);
              throw error;
            })
        );
      }

      const savedConnections = await Promise.all(promises);
      const result = this.repos.connection.convertAllToModel(savedConnections);

      return result;
    });
  }

  @httpDelete("/:churchId/:conversationId/:socketId")
  public async leaveRoom(
    @requestParam("churchId") churchId: string,
    @requestParam("conversationId") conversationId: string,
    @requestParam("socketId") socketId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      if (!(await this.canAccessConnection(churchId, conversationId))) return this.json({}, 401);
      await this.repos.connection.deleteForRoom(churchId, conversationId, socketId);
      await DeliveryHelper.sendAttendance(churchId, conversationId);
      return { success: true };
    });
  }

  @httpPost("/setName")
  public async setName(req: express.Request<{}, {}, { socketId: string; name: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const connections = await this.repos.connection.loadBySocketId(req.body.socketId);
      const au = this.authUser();
      const allowed: Connection[] = [];
      for (const connection of connections) {
        const convData = await this.repos.conversation.loadById(connection.churchId, connection.conversationId);
        const conv = convData ? this.repos.conversation.convertToModel(convData) : null;
        if (this.isAnonPublicConversation(conv) || (au && conv && au.churchId === conv.churchId)) allowed.push(connection);
      }
      if (connections.length > 0 && allowed.length === 0) return this.json({}, 401);
      const promises: Promise<Connection>[] = [];
      allowed.forEach((connection: Connection) => {
        connection.displayName = req.body.name;
        promises.push(
          this.repos.connection.save(connection).then(async (c) => {
            await DeliveryHelper.sendAttendance(c.churchId, c.conversationId);
            return c;
          })
        );
      });
      return this.repos.connection.convertAllToModel(await Promise.all(promises));
    });
  }

  private async canAccessConnection(churchId: string, conversationId: string) {
    const data = await this.repos.conversation.loadById(churchId, conversationId);
    if (!data) return false;
    const conv = this.repos.conversation.convertToModel(data);
    if (this.isAnonPublicConversation(conv)) return true;
    const au = this.authUser();
    return !!(au && au.churchId === conv.churchId);
  }
}
