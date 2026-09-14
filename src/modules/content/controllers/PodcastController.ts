import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { PodcastFeedError, PodcastFeedHelper } from "../helpers/PodcastFeedHelper.js";

// Anonymous proxy for the website "podcast" element: third-party feeds rarely send CORS
// headers and B1App pages render server-side, so the Api fetches/parses and returns JSON.
@controller("/content/podcast")
export class PodcastController extends ContentBaseController {
  @httpGet("/feed")
  public async feed(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
      if (!url) return this.json({ error: "A feed url is required" }, 400);
      try {
        return await PodcastFeedHelper.load(url);
      } catch (e) {
        if (e instanceof PodcastFeedError) return this.json({ error: e.message }, e.status);
        throw e;
      }
    });
  }
}
