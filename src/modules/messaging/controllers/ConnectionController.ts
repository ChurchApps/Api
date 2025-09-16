import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Connection } from "../models";
import { DeliveryHelper } from "../helpers/DeliveryHelper";

@controller("/messaging/connections")
export class ConnectionController extends MessagingBaseController {
  private async updateAnonName(connection: Connection) {
    if (connection.displayName === "Anonymous ") {
      const connections: Connection[] = await this.repos.connection.loadForConversation(connection.churchId, connection.conversationId);
      const anonConnections = connections.filter((c) => c.displayName.includes("Anonymous"));
      if (anonConnections.length > 0) {
        const displayNames = anonConnections.map((c) => c.displayName);
        const numbers: number[] = [];
        displayNames.forEach((name) => {
          const splitName = name.split("_");
          numbers.push(Number(splitName[1]));
        });
        const maxNumber = Math.max(...numbers);
        connection.displayName = `Anonymous_${maxNumber + 1}`;
      } else {
        connection.displayName = "Anonymous_1";
      }
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

  @httpPost("/tmpSendAlert")
  public async sendAlert(req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const connections = await this.repos.connection.loadForNotification(req.body.churchId, req.body.personId);
      const deliveryCount = await DeliveryHelper.sendMessages(connections, {
        churchId: req.body.churchId,
        conversationId: "alert",
        action: "notification",
        data: {}
      });
      return { deliveryCount };
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
