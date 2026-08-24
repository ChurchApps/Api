import { BaseController } from "../../../shared/infrastructure/index.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { Repos } from "../repositories/index.js";

const PUBLIC_ANON_CONTENT_TYPES = new Set(["streamingLive", "freeshow"]);

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

  protected isAnonPublicConversation(conv: { contentType?: string; allowAnonymousPosts?: boolean; visibility?: string }) {
    return !!conv
      && PUBLIC_ANON_CONTENT_TYPES.has(conv.contentType || "")
      && conv.allowAnonymousPosts === true
      && conv.visibility === "public";
  }

  // actionWrapper does NOT reject unauthenticated callers — CustomBaseController hands the action an
  // empty AuthenticatedUser (churchId "", id "") when there is no JWT. Any handler that trusts
  // au.churchId has to assert a real principal itself.
  protected isAuthenticated(au?: { id?: string; churchId?: string }) {
    return !!(au && au.id && au.churchId);
  }

  protected isSameChurch(au: { id?: string; churchId?: string }, churchId: string) {
    return this.isAuthenticated(au) && !!churchId && au.churchId === churchId;
  }
}
