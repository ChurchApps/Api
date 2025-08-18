import { BaseController } from "../../../shared/infrastructure/BaseController";
import { MessagingRepositories } from "../repositories";

export class MessagingBaseController extends BaseController {
  protected messagingRepositories?: MessagingRepositories;

  constructor() {
    super("messaging");
  }

  protected async initializeRepositories(): Promise<void> {
    // Database context is already set by module routing middleware
    this.messagingRepositories = await this.getRepositories<MessagingRepositories>();
  }

  /**
   * Get messaging repositories with proper type safety
   */
  protected async getMessagingRepositories(): Promise<MessagingRepositories> {
    if (!this.messagingRepositories) {
      this.messagingRepositories = await super.getRepositories<MessagingRepositories>();
    }
    return this.messagingRepositories;
  }
}
