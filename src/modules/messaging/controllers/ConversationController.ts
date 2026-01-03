import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Conversation, Message } from "../models/index.js";
import { ArrayHelper, EncryptionHelper } from "@churchapps/apihelper";

@controller("/messaging/conversations")
export class ConversationController extends MessagingBaseController {
  private async appendMessages(conversations: Conversation[], churchId: string) {
    if (conversations?.length > 0) {
      const postIds: string[] = [];
      conversations.forEach((c: Conversation) => {
        if (c && c.firstPostId && postIds.indexOf(c.firstPostId) === -1) postIds.push(c.firstPostId);
        if (c && c.lastPostId && postIds.indexOf(c.lastPostId) === -1) postIds.push(c.lastPostId);
        if (c) c.messages = [];
      }) as any;

      if (postIds.length > 0) {
        const posts = await this.repos.message.loadByIds(churchId, postIds);
        conversations.forEach((c: any) => {
          if (c && c.firstPostId) {
            const message = ArrayHelper.getOne(posts, "id", c.firstPostId);
            if (message) c.messages.push(message);
          }
          if (c && c.lastPostId && c.lastPostId !== c.firstPostId) {
            const message = ArrayHelper.getOne(posts, "id", c.lastPostId);
            if (message) c.messages.push(message);
          }
        }) as any;
      }
      conversations.forEach((c: Conversation) => {
        if (c) {
          c.firstPostId = undefined;
          c.lastPostId = undefined;
        }
      }) as any;
    }
  }

  @httpGet("/timeline/ids")
  public async getTimelineByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const ids = req.query.ids.toString().split(",");
      const result = (await this.repos.conversation.loadByIds(au.churchId, ids)) as Conversation[];
      if (result && Array.isArray(result)) {
        await this.appendMessages(result, au.churchId);
      }
      return result || [];
    }) as any;
  }

  @httpGet("/messages/:contentType/:contentId")
  public async forContent(
    @requestParam("contentType") contentType: string,
    @requestParam("contentId") contentId: string,
    req: express.Request,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const churchId = au.churchId;
      const pageNumber = parseInt((req.query.page as string) || "1", 10);
      const pageSize = parseInt((req.query.limit as string) || "20", 10);

      const conversations = (await this.repos.conversation.loadForContent(
        churchId,
        contentType,
        contentId
      )) as Conversation[];

      for (const conversation of conversations) {
        const paginatedMessages = await this.repos.message.loadForConversationPaginated(
          churchId,
          conversation.id,
          pageNumber,
          pageSize
        );

        conversation.messages = paginatedMessages || [];
      }

      for (let i = conversations.length - 1; i >= 0; i--) {
        if (!conversations[i].messages || conversations[i].messages.length === 0) {
          conversations.splice(i, 1);
        }
      }

      return conversations;
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
      const data = await this.repos.conversation.loadForContent(churchId, contentType, contentId);
      return this.repos.conversation.convertAllToModel(data as any[]);
    }) as any;
  }

  @httpGet("/:churchId/:id")
  public async loadById(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<Conversation> {
    return this.actionWrapperAnon(req, res, async () => {
      const data = await this.repos.conversation.loadById(churchId, id);
      return this.repos.conversation.convertToModel(data);
    }) as any;
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Conversation[]>, res: express.Response): Promise<Conversation[]> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Conversation>[] = [];
      req.body.forEach((conversation) => {
        conversation.churchId = au.churchId;
        promises.push(this.repos.conversation.save(conversation));
      }) as any;
      const result = await Promise.all(promises);
      return this.repos.conversation.convertAllToModel(result);
    }) as any;
  }

  @httpGet("/posts/group/:groupId")
  public async getPostsForGroup(@requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const result = await this.repos.conversation.loadPosts(au.churchId, [groupId]);
      if (result && Array.isArray(result)) {
        await this.appendMessages(result, au.churchId);
      }
      return result || [];
    }) as any;
  }

  @httpGet("/posts")
  public async getPosts(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const result = await this.repos.conversation.loadPosts(au.churchId, au.groupIds || []);
      if (result && Array.isArray(result)) {
        await this.appendMessages(result, au.churchId);
      }
      return result || [];
    }) as any;
  }

  @httpPost("/start")
  public async start(req: express.Request<{}, {}, { groupId: string; contentType: string; contentId: string; title: string; comment: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const c: Conversation = {
        churchId: au.churchId,
        contentType: req.body.contentType,
        contentId: req.body.contentId,
        title: req.body.title,
        dateCreated: new Date(),
        visibility: "public",
        allowAnonymousPosts: false,
        groupId: req.body.groupId
      };
      const conversation = await this.repos.conversation.save(c);

      const m: Message = {
        churchId: au.churchId,
        conversationId: conversation.id,
        personId: au.personId,
        displayName: au.firstName + " " + au.lastName,
        timeSent: new Date(),
        content: req.body.comment,
        messageType: "comment"
      };
      await this.repos.message.save(m);

      this.repos.conversation.updateStats(conversation.id);

      return conversation;
    }) as any;
  }

  @httpGet("/current/:churchId/:contentType/:contentId")
  public async current(
    @requestParam("churchId") churchId: string,
    @requestParam("contentType") contentType: string,
    @requestParam("contentId") contentId: string,
    req: express.Request<{}, {}, {}>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.getOrCreate(churchId, contentType, contentId, "public", true);
    }) as any;
  }


  @httpDelete("/:churchId/:id")
  public async delete(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<void> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.conversation.delete(au.churchId, id);
    }) as any;
  }

  private async getOrCreate(churchId: string, contentType: string, contentId: string, visibility: string, allowAnonymousPosts: boolean) {
    const CONTENT_ID = contentId.length > 11 ? EncryptionHelper.decrypt(contentId.toString()) : contentId;
    let result: Conversation = await this.repos.conversation.loadCurrent(churchId, contentType, CONTENT_ID);
    if (result === null) {
      result = {
        contentId: CONTENT_ID,
        contentType,
        dateCreated: new Date(),
        title: contentType + " #" + CONTENT_ID,
        churchId,
        visibility,
        allowAnonymousPosts
      };
      result = await this.repos.conversation.save(result);
    }
    return result;
  }
}
