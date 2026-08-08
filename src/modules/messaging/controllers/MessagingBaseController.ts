import { BaseController } from "../../../shared/infrastructure/index.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { Repos } from "../repositories/index.js";

export class MessagingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("messaging");
  }

  protected isPersonNote(contentType?: string) {
    return contentType === "person" || contentType === "personConfidential";
  }

  protected canViewPersonNotes(au: any, contentType?: string) {
    if (!au) return false;
    return contentType === "personConfidential"
      ? au.checkAccess(Permissions.people.viewConfidentialNotes)
      : au.checkAccess(Permissions.people.edit);
  }
}
