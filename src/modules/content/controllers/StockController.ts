import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import Pexels from "pexels";
import { Environment } from "../helpers/index.js";

interface StockPhoto { description: string; url: string; photographer: string; photographerUrl: string; large: string; thumbnail: string }

@controller("/content/stock")
export class StockController extends ContentBaseController {
  // authz-exempt: open to any authenticated user — Pexels stock-photo search, no church data touched
  @httpPost("/search")
  public async getUploadUrl(req: express.Request<{}, {}, { term: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({}, 401);
      const key = Environment.pexelsKey;
      const client = Pexels.createClient(key);
      const response: Pexels.PhotosWithTotalResults = (await client.photos.search({
        query: req.body.term,
        per_page: 50
      })) as Pexels.PhotosWithTotalResults;
      const result: StockPhoto[] = [];
      response.photos.forEach((p) => {
        result.push({
          description: p.alt,
          url: p.url,
          photographer: p.photographer,
          photographerUrl: p.photographer_url,
          large: p.src.large,
          thumbnail: p.src.small
        });
      });
      return result;
    });
  }
}
