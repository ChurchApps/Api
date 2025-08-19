import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController";
import { Conversation } from "../models";
import { ArrayHelper } from "@churchapps/apihelper";

@controller("/messaging/conversations")
export class ConversationController extends MessagingBaseController {
  private async appendMessages(conversations: Conversation[], churchId: string) {
    if (conversations?.length > 0) {
      const postIds: string[] = [];
      conversations.forEach((c: Conversation) => {
        if (c.firstPostId && postIds.indexOf(c.firstPostId) === -1) postIds.push(c.firstPostId);
        if (c.lastPostId && postIds.indexOf(c.lastPostId) === -1) postIds.push(c.lastPostId);
        c.messages = [];
      });

      if (postIds.length > 0) {
        const posts = await this.messagingRepositories.message.loadByIds(churchId, postIds);
        conversations.forEach((c: any) => {
          if (c.firstPostId) {
            const message = ArrayHelper.getOne(posts, "id", c.firstPostId);
            if (message) c.messages.push(message);
          }
          if (c.lastPostId && c.lastPostId !== c.firstPostId) {
            const message = ArrayHelper.getOne(posts, "id", c.lastPostId);
            if (message) c.messages.push(message);
          }
        });
      }
      conversations.forEach((c: Conversation) => {
        c.firstPostId = undefined;
        c.lastPostId = undefined;
      });
    }
  }

  @httpGet("/timeline/ids")
  public async getTimelineByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      const ids = req.query.ids.toString().split(",");
      const result = (await this.messagingRepositories.conversation.loadByIds(au.churchId, ids)) as Conversation[];
      await this.appendMessages(result, au.churchId);
      return result;
    });
  }

  @httpGet("/:churchId/:contentType/:contentId")
  public async loadByContent(
    @requestParam("churchId") churchId: string,
    @requestParam("contentType") contentType: string,
    @requestParam("contentId") contentId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Conversation[]> {
    return this.actionWrapperAnon(req, res, async () => {
      await this.initializeRepositories();
      const data = await this.messagingRepositories.conversation.loadForContent(churchId, contentType, contentId);
      return this.messagingRepositories.conversation.convertAllToModel(data as any[]);
    });
  }

  @httpGet("/:churchId/:id")
  public async loadById(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Conversation> {
    return this.actionWrapperAnon(req, res, async () => {
      await this.initializeRepositories();
      const data = await this.messagingRepositories.conversation.loadById(churchId, id);
      return this.messagingRepositories.conversation.convertToModel(data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Conversation[]>, res: express.Response): Promise<Conversation[]> {
    return this.actionWrapper(req, res, async (au) => {
      await this.initializeRepositories();
      const promises: Promise<Conversation>[] = [];
      req.body.forEach((conversation) => {
        conversation.churchId = au.churchId;
        promises.push(this.messagingRepositories.conversation.save(conversation));
      });
      const result = await Promise.all(promises);
      return this.messagingRepositories.conversation.convertAllToModel(result);
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
      await this.messagingRepositories.conversation.delete(au.churchId, id);
    });
  }
}
