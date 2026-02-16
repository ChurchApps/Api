import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { PrivateMessage } from "../models/index.js";
import { ArrayHelper } from "@churchapps/apihelper";
import { NotificationHelper } from "../helpers/NotificationHelper.js";

@controller("/messaging/privatemessages")
export class PrivateMessageController extends MessagingBaseController {
  @httpPost("/")
  public async save(req: express.Request<{}, {}, PrivateMessage[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<PrivateMessage>[] = [];
      req.body.forEach((conv) => {
        conv.churchId = au.churchId;
        const promise = this.repos.privateMessage.save(conv).then((c) => {
          // For direct private message API, use generic notification since we don't have message content
          // Private messages through conversations use the typed notification in checkShouldNotify
          NotificationHelper.notifyUser(au.churchId, c.toPersonId, "New Private Message").then((method) => {
            if (method) {
              c.deliveryMethod = method;
              this.repos.privateMessage.save(c);
            }
          });
          return c;
        });
        promises.push(promise);
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const privateMessages: PrivateMessage[] = await this.repos.privateMessage.loadByPersonId(au.churchId, au.personId);
      const messageIds: string[] = [];
      privateMessages.forEach((pm) => {
        if (pm.conversation && pm.conversation.lastPostId && messageIds.indexOf(pm.conversation.lastPostId) === -1) {
          messageIds.push(pm.conversation.lastPostId);
        }
      });
      if (messageIds.length > 0) {
        const allMessages = await this.repos.message.loadByIds(au.churchId, messageIds);
        privateMessages.forEach((pm) => {
          if (pm.conversation.lastPostId) {
            pm.conversation.messages = [ArrayHelper.getOne(allMessages, "id", pm.conversation.lastPostId)];
          } else {
            pm.conversation.messages = [];
          }
        });
      } else {
        // No messages to fetch, set empty arrays
        privateMessages.forEach((pm) => {
          pm.conversation.messages = [];
        });
      }

      await this.repos.privateMessage.markAllRead(au.churchId, au.personId);

      return privateMessages;
    });
  }

  @httpGet("/existing/:personId")
  public async getExisting(@requestParam("personId") _personId: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      // TODO: Implement loadExisting functionality to find existing conversation between two people
      // const existing = await this.repos.privateMessage.loadExisting(au.churchId, au.personId, personId);
      const existing = null; // Temporary placeholder
      return existing || {};
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const result = (await this.repos.privateMessage.loadById(au.churchId, id)) as any;
      if (result.notifyPersonId === au.personId) {
        result.notifyPersonId = null;
        await this.repos.privateMessage.save(result);
      }
      return result;
    });
  }
}
