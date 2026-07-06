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
      const data = await this.repos.connection.loadForConversation(churchId, conversationId);
      const connections = this.repos.connection.convertAllToModel(data);
      return connections;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Connection[]>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const promises: Promise<Connection>[] = [];
      for (const connection of req.body) {
        if (connection.personId === undefined) connection.personId = null;
        await this.updateAnonName(connection); // update 'Anonymous' names to Anonymous_1, Anonymous_2,..so on.
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
      await this.repos.connection.deleteForRoom(churchId, conversationId, socketId);
      await DeliveryHelper.sendAttendance(churchId, conversationId);
      return { success: true };
    });
  }

  @httpPost("/setName")
  public async setName(req: express.Request<{}, {}, { socketId: string; name: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const connections = await this.repos.connection.loadBySocketId(req.body.socketId);
      const promises: Promise<Connection>[] = [];
      connections.forEach((connection: Connection) => {
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
}
