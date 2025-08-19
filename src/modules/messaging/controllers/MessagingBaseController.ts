import { BaseController } from "../../../shared/infrastructure/BaseController";
import { MessagingRepositories } from "../repositories";

export class MessagingBaseController extends BaseController {
  public repositories: MessagingRepositories;

  constructor() {
    super("messaging");
  }

  protected async getMessagingRepositories(): Promise<MessagingRepositories> {
    if (!this.repositories) {
      this.repositories = await this.getRepositories<MessagingRepositories>();
    }
    return this.repositories;
  }
}
