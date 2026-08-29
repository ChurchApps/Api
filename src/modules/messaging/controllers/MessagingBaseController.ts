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

  // Single read gate for every messaging route: anonymous public livestream rooms are open, person
  // notes run through the notes RBAC, and everything else needs same-church plus the per-type rule.
  protected async canReadConversation(au: any, conv: any): Promise<boolean> {
    if (!conv) return false;
    if (this.isAnonPublicConversation(conv)) return true;
    if (this.isPersonNote(conv.contentType)) return this.canViewPersonNotes(au, conv.contentType);
    if (!this.isSameChurch(au, conv.churchId)) return false;
    if (au.checkAccess(Permissions.content.edit)) return true;
    if (conv.contentType === "group" || conv.contentType === "groupAnnouncement") {
      return !!conv.contentId && (!!au.groupIds?.includes(conv.contentId) || !!au.leaderGroupIds?.includes(conv.contentId));
    }
    if (conv.contentType === "streamingLiveHost") return !!au.checkAccess(Permissions.chat.host);
    if (conv.contentType === "privateMessage") {
      const pm = (await this.repos.privateMessage.loadById(au.churchId, conv.contentId)) as any;
      return !!pm && (pm.fromPersonId === au.personId || pm.toPersonId === au.personId);
    }
    return true;
  }
}
