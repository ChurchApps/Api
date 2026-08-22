import { BaseController } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";
import { SiteCacheHelper } from "../helpers/SiteCacheHelper.js";

export class ContentBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("content");
  }

  protected bumpSiteCache(churchId: string) {
    SiteCacheHelper.bump(churchId);
  }
}
