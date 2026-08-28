import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { PrivateMessage } from "../models/index.js";
import { ArrayHelper } from "@churchapps/apihelper";
import { getMembershipModuleGateway } from "../../../shared/modules/MembershipModuleGateway.js";
import { MessagingSafetyHelper } from "../../../shared/helpers/index.js";

@controller("/messaging/privatemessages")
export class PrivateMessageController extends MessagingBaseController {
  @httpPost("/")
  public async save(req: express.Request<{}, {}, PrivateMessage[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const gateway = getMembershipModuleGateway();
      const minimumAge = MessagingSafetyHelper.parseMinimumAge(await gateway.loadSetting(au.churchId, "messagingMinimumAge"));
      if (minimumAge > 0) {
        const ids = new Set<string>();
        req.body.forEach((conv) => { if (conv.toPersonId) ids.add(conv.toPersonId); });
        if (au.personId) ids.add(au.personId);
        const people = await Promise.all([...ids].map((id) => gateway.loadPerson(au.churchId, id)));
        // Null loads (unknown/removed ids) are out of scope of this rule — fail open.
        if (people.some((p) => MessagingSafetyHelper.isRestricted(p, minimumAge))) {
          return this.json({ errors: ["ageRestricted"] }, 403);
        }
      }
      const promises: Promise<PrivateMessage>[] = [];
      req.body.forEach((conv) => {
        conv.churchId = au.churchId;
        conv.fromPersonId = au.personId;
        // One row per pair: reuse it rather than stacking duplicates. The message that follows carries the notification.
        const promise = this.repos.privateMessage
          .loadExisting(au.churchId, au.personId, conv.toPersonId)
          .then((existing) => existing || this.repos.privateMessage.save(conv));
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

      return privateMessages;
    });
  }

  @httpGet("/existing/:personId")
  public async getExisting(@requestParam("personId") personId: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = (await this.repos.privateMessage.loadExisting(au.churchId, au.personId, personId)) as any;
      if (!existing) return {};
      if (existing.notifyPersonId === au.personId) {
        existing.notifyPersonId = null;
        await this.repos.privateMessage.save(existing);
        // The shadow row's contentId is the privateMessage id; retire it too.
        await this.repos.notification.markPrivateMessageRead(au.churchId, au.personId, existing.id);
      }
      return existing;
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
