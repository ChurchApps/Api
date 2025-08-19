import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Message } from "../models";
import { DeliveryHelper } from "../helpers/DeliveryHelper";
import { NotificationHelper } from "../helpers/NotificationHelper";

@controller("/messaging/messages")
export class MessageController extends MessagingBaseController {
  @httpGet("/:churchId/:conversationId")
  public async loadForConversation(
    @requestParam("churchId") churchId: string,
    @requestParam("conversationId") conversationId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Message[]> {
    return this.actionWrapperAnon(req, res, async () => {
      const repos = await this.getMessagingRepositories();
      const data = await repos.message.loadForConversation(churchId, conversationId);
      return repos.message.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Message> {
    return this.actionWrapperAnon(req, res, async () => {
      const repos = await this.getMessagingRepositories();
      const data = await repos.message.loadById(churchId, id);
      return repos.message.convertToModel(data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Message[]>, res: express.Response): Promise<Message[]> {
    return this.actionWrapperAnon(req, res, async () => {
      const repos = await this.getMessagingRepositories();
      const promises: Promise<Message>[] = [];
      req.body.forEach((message) => {
        promises.push(
          repos.message.save(message).then(async (savedMessage) => {
            const conversation = await repos.conversation.loadById(
              message.churchId,
              message.conversationId
            );
            const conv = repos.conversation.convertToModel(conversation);
            await repos.conversation.updateStats(message.conversationId);

            // Send real-time updates
            await DeliveryHelper.sendConversationMessages({
              churchId: message.churchId,
              conversationId: message.conversationId,
              action: "message",
              data: savedMessage
            }) as any;

            // Handle notifications
            await NotificationHelper.checkShouldNotify(conv, savedMessage, message.personId || "anonymous");

            return savedMessage;
          })
        );
      }) as any;
      const result = await Promise.all(promises);
      return repos.message.convertAllToModel(result as any[]);
    }) as any;
  }

  @httpDelete("/:churchId/:id")
  public async delete(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getMessagingRepositories();
      const message = await repos.message.loadById(au.churchId, id);
      if (message) {
        await repos.message.delete(au.churchId, id);

        // Send real-time delete notification
        await DeliveryHelper.sendConversationMessages({
          churchId: au.churchId,
          conversationId: message.conversationId,
          action: "deleteMessage",
          data: { id }
        }) as any;
      }
    }) as any;
  }
}
