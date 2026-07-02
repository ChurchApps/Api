import express from "express";
import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
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
      return await this.repos.post.loadPublished(churchId, { category, tag, limit: pageSize, offset: (page - 1) * pageSize });
    });
  }

  @httpGet("/public/:churchId/slug/:slug")
  public async loadPublicBySlug(@requestParam("churchId") churchId: string, @requestParam("slug") slug: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.post.loadPublishedBySlug(churchId, slug);
    });
  }

  @httpGet("/rss/:churchId")
  public async rss(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const siteUrl = req.query.siteUrl ? req.query.siteUrl.toString().replace(/\/$/, "") : "";
      const posts = await this.repos.post.loadPublished(churchId, { limit: 50 });
      res.set("Content-Type", "application/rss+xml");
      res.send(this.buildRss(posts, siteUrl));
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.post.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.post.loadAll(au.churchId);
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

  private buildRss(posts: Post[], siteUrl: string): string {
    const items = posts.map((p) => {
      const link = siteUrl + "/blog/" + (p.slug || "");
      const pubDate = p.publishDate ? new Date(p.publishDate).toUTCString() : "";
      return [
        "    <item>",
        "      <title>" + this.escapeXml(p.title || "") + "</title>",
        "      <link>" + this.escapeXml(link) + "</link>",
        "      <guid isPermaLink=\"false\">" + this.escapeXml(p.id || link) + "</guid>",
        "      <description>" + this.escapeXml(p.excerpt || "") + "</description>",
        pubDate ? "      <pubDate>" + pubDate + "</pubDate>" : "",
        "    </item>"
      ].filter(Boolean).join("\n");
    }).join("\n");
    return [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<rss version=\"2.0\">",
      "  <channel>",
      "    <title>Church Blog</title>",
      "    <link>" + this.escapeXml(siteUrl || "/blog") + "</link>",
      "    <description>Latest posts</description>",
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
