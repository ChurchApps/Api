import express from "express";
import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Permissions } from "../helpers/index.js";
import { Post } from "../models/index.js";
import { ContentBaseController } from "./ContentBaseController.js";

@controller("/content/posts")
export class PostController extends ContentBaseController {
  @httpGet("/public/:churchId")
  public async loadPublic(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const category = req.query.category ? req.query.category.toString() : undefined;
      const tag = req.query.tag ? req.query.tag.toString() : undefined;
      const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt((req.query.pageSize as string) || "10", 10) || 10));
      const posts = await this.repos.post.loadPublished(churchId, { category, tag, limit: pageSize, offset: (page - 1) * pageSize });
      return await this.attachAuthorNames(churchId, posts);
    });
  }

  @httpGet("/public/:churchId/categories")
  public async loadPublicCategories(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.post.loadPublishedCategories(churchId);
    });
  }

  @httpGet("/public/:churchId/slug/:slug")
  public async loadPublicBySlug(@requestParam("churchId") churchId: string, @requestParam("slug") slug: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const post = await this.repos.post.loadPublishedBySlug(churchId, slug);
      if (post) await this.attachAuthorNames(churchId, [post]);
      return post;
    });
  }

  @httpGet("/rss/:churchId")
  public async rss(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const siteUrl = req.query.siteUrl ? req.query.siteUrl.toString().replace(/\/$/, "") : "";
      const posts = await this.repos.post.loadPublished(churchId, { limit: 50 });
      const church = await getMembershipModuleGateway().loadChurch(churchId);
      res.set("Content-Type", "application/rss+xml");
      res.send(this.buildRss(posts, siteUrl, church?.name || "Church Blog"));
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const post = await this.repos.post.load(au.churchId, id);
      if (post) await this.attachAuthorNames(au.churchId, [post]);
      return post;
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const posts = await this.repos.post.loadAll(au.churchId);
      return await this.attachAuthorNames(au.churchId, posts);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Post[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const promises: Promise<Post>[] = [];
      req.body.forEach((post) => {
        post.churchId = au.churchId;
        promises.push(this.repos.post.save(post));
      });
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.post.delete(au.churchId, id);
      return this.json({});
    });
  }

  private async attachAuthorNames(churchId: string, posts: Post[]): Promise<Post[]> {
    const ids = [...new Set(posts.map((p) => p.authorId).filter(Boolean))] as string[];
    if (ids.length === 0) return posts;
    const people = await getMembershipModuleGateway().loadPeople(churchId, ids);
    const names = new Map(people.map((p) => [p.id, p.displayName]));
    posts.forEach((p) => { if (p.authorId) p.authorName = names.get(p.authorId); });
    return posts;
  }

  private buildRss(posts: Post[], siteUrl: string, churchName: string): string {
    const items = posts.map((p) => {
      const link = siteUrl + "/blog/" + (p.slug || "");
      const pubDate = p.publishDate ? new Date(p.publishDate).toUTCString() : "";
      const description = p.excerpt || (p.content || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*_`~]/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
      return [
        "    <item>",
        "      <title>" + this.escapeXml(p.title || "") + "</title>",
        "      <link>" + this.escapeXml(link) + "</link>",
        "      <guid isPermaLink=\"false\">" + this.escapeXml(p.id || link) + "</guid>",
        "      <description>" + this.escapeXml(description) + "</description>",
        p.category ? "      <category>" + this.escapeXml(p.category) + "</category>" : "",
        pubDate ? "      <pubDate>" + pubDate + "</pubDate>" : "",
        "    </item>"
      ].filter(Boolean).join("\n");
    }).join("\n");
    return [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<rss version=\"2.0\">",
      "  <channel>",
      "    <title>" + this.escapeXml(churchName) + "</title>",
      "    <link>" + this.escapeXml(siteUrl || "/blog") + "</link>",
      "    <description>" + this.escapeXml("Latest posts from " + churchName) + "</description>",
      items,
      "  </channel>",
      "</rss>"
    ].join("\n");
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
