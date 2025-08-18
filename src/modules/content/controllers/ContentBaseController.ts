import { BaseController } from "../../../shared/infrastructure/BaseController";
import { ContentRepositories } from "../repositories";

export class ContentBaseController extends BaseController {
  protected repositories?: ContentRepositories;

  constructor() {
    super("content");
  }

  /**
   * Get content repositories with proper type safety
   */
  protected async getContentRepositories(): Promise<ContentRepositories> {
    if (!this.repositories) {
      this.repositories = await super.getRepositories<ContentRepositories>();
    }
    return this.repositories;
  }
}
