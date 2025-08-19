import { ModuleBaseController } from "../../../shared/infrastructure/BaseController";
import { ContentRepositories } from "../repositories";

export class ContentBaseController extends ModuleBaseController<ContentRepositories> {
  constructor() {
    super("content");
  }

  /**
   * Get content repositories with proper type safety
   */
  protected async getContentRepositories(): Promise<ContentRepositories> {
    return await this.getModuleRepositories();
  }
}
