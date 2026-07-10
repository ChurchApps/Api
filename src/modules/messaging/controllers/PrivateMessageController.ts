import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
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
        conv.fromPersonId = au.personId;
        const promise = this.repos.privateMessage.save(conv).then((c) => {
          // For direct private message API, use generic notification since we don't have message content
          // Private messages through conversations use the typed notification in checkShouldNotify
          NotificationHelper.notifyUser(au.churchId, c.toPersonId, "New Private Message");
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
      // Retire the escalator's DM shadow rows now that the inbox has been read.
      await this.repos.notification.markPrivateMessagesRead(au.churchId, au.personId);

      return privateMessages;
    });
  }

  @httpGet("/existing/:personId")
  public async getExisting(@requestParam("personId") _personId: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      // TODO: Implement loadExisting functionality to find existing conversation between two people
      // const existing = await this.repos.privateMessage.loadExisting(au.churchId, au.personId, personId);
      const existing: any = null; // Temporary placeholder
      return existing || {};
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const result = (await this.repos.privateMessage.loadById(au.churchId, id)) as any;
      if (result?.fromPersonId !== au.personId && result?.toPersonId !== au.personId) return this.json({}, 401);
      if (result.notifyPersonId === au.personId) {
        result.notifyPersonId = null;
        await this.repos.privateMessage.save(result);
        // The shadow row's contentId is the privateMessage id; retire it too.
        await this.repos.notification.markPrivateMessageRead(au.churchId, au.personId, result.id);
      }
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const pm = (await this.repos.privateMessage.loadById(au.churchId, id)) as any;
      if (!pm) {
        return this.json({ error: "Conversation not found" }, 404);
      }
      const isParticipant = pm.fromPersonId === au.personId || pm.toPersonId === au.personId;
      if (!isParticipant) {
        return this.json({ error: "Unauthorized" }, 401);
      }
      await this.repos.privateMessage.delete(au.churchId, id);
      return { success: true };
    });
  }
}
