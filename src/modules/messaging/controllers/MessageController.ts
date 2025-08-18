import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Message } from "../models";
import { DeliveryHelper } from "../helpers/DeliveryHelper";
import { NotificationHelper } from "../helpers/NotificationHelper";

@controller("/messages")
export class MessageController extends MessagingBaseController {
  @httpGet("/:churchId/:conversationId")
  public async loadForConversation(
    @requestParam("churchId") churchId: string,
    @requestParam("conversationId") conversationId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Message[]> {
    return this.actionWrapperAnon(req, res, async () => {
      await this.initializeRepositories();
      const data = await this.messagingRepositories.message.loadForConversation(churchId, conversationId);
      return this.messagingRepositories.message.convertAllToModel(data as any[]);
    });
  }

  @httpGet("/:churchId/:id")
  public async loadById(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Message> {
    return this.actionWrapperAnon(req, res, async () => {
      await this.initializeRepositories();
      const data = await this.messagingRepositories.message.loadById(churchId, id);
      return this.messagingRepositories.message.convertToModel(data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Message[]>, res: express.Response): Promise<Message[]> {
    return this.actionWrapperAnon(req, res, async () => {
      await this.initializeRepositories();
      const promises: Promise<Message>[] = [];
      req.body.forEach((message) => {
        promises.push(
          this.messagingRepositories.message.save(message).then(async (savedMessage) => {
            const conversation = await this.messagingRepositories.conversation.loadById(
              message.churchId,
              message.conversationId
            );
            const conv = this.messagingRepositories.conversation.convertToModel(conversation);
            await this.messagingRepositories.conversation.updateStats(message.conversationId);

            // Send real-time updates
            await DeliveryHelper.sendConversationMessages({
              churchId: message.churchId,
              conversationId: message.conversationId,
              action: "message",
              data: savedMessage
            });

            // Handle notifications
            await NotificationHelper.checkShouldNotify(conv, savedMessage, message.personId || "anonymous");

            return savedMessage;
          })
        );
      });
      const result = await Promise.all(promises);
      return this.messagingRepositories.message.convertAllToModel(result as any[]);
    });
  }

  @httpDelete("/:churchId/:id")
  public async delete(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      const message = await this.messagingRepositories.message.loadById(au.churchId, id);
      if (message) {
        await this.messagingRepositories.message.delete(au.churchId, id);

        // Send real-time delete notification
        await DeliveryHelper.sendConversationMessages({
          churchId: au.churchId,
          conversationId: message.conversationId,
          action: "deleteMessage",
          data: { id }
        });
      }
    });
  }
}
