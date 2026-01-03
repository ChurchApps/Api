import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Message } from "../models/index.js";
import { DeliveryHelper } from "../helpers/DeliveryHelper.js";
import { NotificationHelper } from "../helpers/NotificationHelper.js";

@controller("/messaging/messages")
export class MessageController extends MessagingBaseController {
  @httpGet("/conversation/:conversationId")
  public async loadByConversation(@requestParam("conversationId") conversationId: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const messages: Message[] = await this.repos.message.loadForConversation(au.churchId, conversationId);
      return this.repos.message.convertAllToModel(messages);
    });
  }

  @httpGet("/catchup/:churchId/:conversationId")
  public async catchup(@requestParam("churchId") churchId: string, @requestParam("conversationId") conversationId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Message[]> {
    return this.actionWrapperAnon(req, res, async () => {
      const messages: Message[] = await this.repos.message.loadForConversation(churchId, conversationId);
      return this.repos.message.convertAllToModel(messages);
    }) as any;
  }

  @httpPost("/send")
  public async send(req: express.Request<{}, {}, Message[]>, res: express.Response): Promise<Message[]> {
    return this.actionWrapperAnon(req, res, async () => {
      const promises: Promise<Message>[] = [];
      req.body.forEach((message) => {
        promises.push(
          this.repos.message.save(message).then(async (savedMessage) => {
            const conversation = await this.repos.conversation.loadById(message.churchId, message.conversationId);
            const conv = this.repos.conversation.convertToModel(conversation);
            await this.repos.conversation.updateStats(message.conversationId);

            // Send real-time updates
            (await DeliveryHelper.sendConversationMessages({
              churchId: message.churchId,
              conversationId: message.conversationId,
              action: "message",
              data: savedMessage
            })) as any;

            // Handle notifications
            await NotificationHelper.checkShouldNotify(conv, savedMessage, savedMessage.personId || "anonymous");

            return savedMessage;
          })
        );
      }) as any;
      const result = await Promise.all(promises);
      return this.repos.message.convertAllToModel(result as any[]);
    }) as any;
  }

  @httpPost("/setCallout")
  public async setCallout(req: express.Request<{}, {}, Message>, res: express.Response): Promise<Message> {
    return this.actionWrapper(req, res, async (au) => {
      const message = req.body;
      if (!message.churchId && au?.churchId) message.churchId = au.churchId;

      // Send real-time callout update
      await DeliveryHelper.sendConversationMessages({
        churchId: message.churchId,
        conversationId: message.conversationId,
        action: "callout",
        data: message
      });

      return message;
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Message> {
    return this.actionWrapperAnon(req, res, async () => {
      const data = await this.repos.message.loadById(churchId, id);
      return this.repos.message.convertToModel(data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Message[]>, res: express.Response): Promise<Message[]> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Message>[] = [];
      req.body.forEach((message) => {
        if (!message.churchId && au?.churchId) message.churchId = au.churchId;
        if (!message.personId && au?.personId) message.personId = au.personId;
        promises.push(
          this.repos.message.save(message).then(async (savedMessage) => {
            const conversation = await this.repos.conversation.loadById(message.churchId, message.conversationId);
            const conv = this.repos.conversation.convertToModel(conversation);
            await this.repos.conversation.updateStats(message.conversationId);

            // Send real-time updates
            (await DeliveryHelper.sendConversationMessages({
              churchId: message.churchId,
              conversationId: message.conversationId,
              action: "message",
              data: savedMessage
            })) as any;

            // Handle notifications
            await NotificationHelper.checkShouldNotify(conv, savedMessage, savedMessage.personId || "anonymous");

            return savedMessage;
          })
        );
      }) as any;
      const result = await Promise.all(promises);
      return this.repos.message.convertAllToModel(result as any[]);
    }) as any;
  }

  @httpDelete("/:churchId/:id")
  public async delete(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      const message = await this.repos.message.loadById(au.churchId, id);
      if (Object.keys(message).length !== 0) {
        await this.repos.message.delete(au.churchId, id);

        // Send real-time delete notification
        (await DeliveryHelper.sendConversationMessages({
          churchId: au.churchId,
          conversationId: message.conversationId,
          action: "deleteMessage",
          data: { id }
        })) as any;

        return this.json({ message: "Message deleted successfully" }, 200);
      } else {
        return this.json({ error: "Message not found" }, 404);
      }
    }) as any;
  }
}
