import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Connection } from "../models";
import { DeliveryHelper } from "../helpers/DeliveryHelper";

@controller("/messaging/connections")
export class ConnectionController extends MessagingBaseController {
  private async updateAnonName(connection: Connection) {
    if (connection.displayName === "Anonymous ") {
      const connections: Connection[] = await this.repositories.connection.loadForConversation(connection.churchId, connection.conversationId);
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
      const data = await this.repositories.connection.loadForConversation(churchId, conversationId);
      const connections = this.repositories.connection.convertAllToModel(data);
      return connections;
    });
  }

  @httpPost("/tmpSendAlert")
  public async sendAlert(req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const connections = await this.repositories.connection.loadForNotification(req.body.churchId, req.body.personId);
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
      console.log(`🔵 ConnectionController.save - Received ${req.body.length} connections to save`);
      console.log("🔵 Connection data:", JSON.stringify(req.body, null, 2));

      const promises: Promise<Connection>[] = [];
      for (const connection of req.body) {
        if (connection.personId === undefined) connection.personId = null;
        await this.updateAnonName(connection); // update 'Anonymous' names to Anonymous_1, Anonymous_2,..so on.

        console.log(`🔵 About to save connection: ${JSON.stringify(connection)}`);
        promises.push(
          this.repositories.connection
            .save(connection)
            .then(async (c) => {
              console.log("✅ Successfully saved connection to database:", JSON.stringify(c));
              await DeliveryHelper.sendAttendance(c.churchId, c.conversationId);
              await DeliveryHelper.sendBlockedIps(c.churchId, c.conversationId);
              console.log(`✅ Sent attendance and blocked IPs for connection ${c.id}`);
              return c;
            })
            .catch((error) => {
              console.error("❌ Failed to save connection:", error);
              throw error;
            })
        );
      }

      const savedConnections = await Promise.all(promises);
      const result = this.repositories.connection.convertAllToModel(savedConnections);
      console.log(`🎯 ConnectionController.save - Returning ${result.length} saved connections`);
      console.log("🎯 Final result:", JSON.stringify(result, null, 2));

      return result;
    });
  }

  @httpPost("/setName")
  public async setName(req: express.Request<{}, {}, { socketId: string; name: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const connections = await this.repositories.connection.loadBySocketId(req.body.socketId);
      const promises: Promise<Connection>[] = [];
      connections.forEach((connection: Connection) => {
        connection.displayName = req.body.name;
        promises.push(
          this.repositories.connection.save(connection).then(async (c) => {
            await DeliveryHelper.sendAttendance(c.churchId, c.conversationId);
            return c;
          })
        );
      });
      return this.repositories.connection.convertAllToModel(await Promise.all(promises));
    });
  }
}
