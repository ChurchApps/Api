import { ModuleBaseController } from "../../../shared/infrastructure/BaseController";
import { MessagingRepositories } from "../repositories";

export class MessagingBaseController extends ModuleBaseController<MessagingRepositories> {
  // Compatibility property for existing controllers
  protected messagingRepositories?: MessagingRepositories;

  constructor() {
    super("messaging");
  }

  /**
   * Get messaging repositories with proper type safety
   */
  protected async getMessagingRepositories(): Promise<MessagingRepositories> {
    return await this.getModuleRepositories();
  }

  /**
   * Compatibility method for existing controllers that use initializeRepositories()
   */
  protected async initializeRepositories(): Promise<void> {
    if (!this.messagingRepositories) {
      this.messagingRepositories = await this.getModuleRepositories();
    }
  }
}
