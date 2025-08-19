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
      }) as any;

      if (postIds.length > 0) {
        const repos = await this.getMessagingRepositories();
        const posts = await repos.message.loadByIds(churchId, postIds);
        conversations.forEach((c: any) => {
          if (c.firstPostId) {
            const message = ArrayHelper.getOne(posts, "id", c.firstPostId);
            if (message) c.messages.push(message);
          }
          if (c.lastPostId && c.lastPostId !== c.firstPostId) {
            const message = ArrayHelper.getOne(posts, "id", c.lastPostId);
            if (message) c.messages.push(message);
          }
        }) as any;
      }
      conversations.forEach((c: Conversation) => {
        c.firstPostId = undefined;
        c.lastPostId = undefined;
      }) as any;
    }
  }

  @httpGet("/timeline/ids")
  public async getTimelineByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getMessagingRepositories();
      const ids = req.query.ids.toString().split(",");
      const result = (await repos.conversation.loadByIds(au.churchId, ids)) as Conversation[];
      await this.appendMessages(result, au.churchId);
      return result;
    }) as any;
  }

  @httpGet("/:churchId/:contentType/:contentId")
  public async loadByContent(
    @requestParam("churchId") churchId: string,
    @requestParam("contentType") contentType: string,
    @requestParam("contentId") contentId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Conversation[]> {
    return this.actionWrapperAnon(req, res, async (): Promise<Conversation[]> => {
      const repos = await this.getMessagingRepositories();
      const data = await repos.conversation.loadForContent(churchId, contentType, contentId);
      return repos.conversation.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(
    @requestParam("churchId") churchId: string,
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<Conversation> {
    return this.actionWrapperAnon(req, res, async () => {
      const repos = await this.getMessagingRepositories();
      const data = await repos.conversation.loadById(churchId, id);
      return repos.conversation.convertToModel(data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Conversation[]>, res: express.Response): Promise<Conversation[]> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getMessagingRepositories();
      const promises: Promise<Conversation>[] = [];
      req.body.forEach((conversation) => {
        conversation.churchId = au.churchId;
        promises.push(repos.conversation.save(conversation));
      }) as any;
      const result = await Promise.all(promises);
      return repos.conversation.convertAllToModel(result);
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
      await repos.conversation.delete(au.churchId, id);
    }) as any;
  }
}
