import { BaseController } from "../../../shared/infrastructure/BaseController";
import { ContentRepositories } from "../repositories";

export class ContentBaseController extends BaseController {
  public repositories: ContentRepositories;

  constructor() {
    super("content");
  }

  protected async getContentRepositories(): Promise<ContentRepositories> {
    if (!this.repositories) {
      this.repositories = await this.getRepositories<ContentRepositories>();
    }
    return this.repositories;
  }
}
