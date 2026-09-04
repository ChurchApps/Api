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

  // Who may write into a group's chat feeds (posting, or seeding the conversation row). Stricter than
  // reading/reacting: members only, announcements are leader-only, and each feed honors the group's
  // per-feed toggle (ChurchAppsSupport#1054). Staff with content.edit moderate anywhere.
  protected async canPostToGroupFeed(au: any, contentType: string, contentId?: string): Promise<boolean> {
    if (au?.checkAccess(Permissions.content.edit)) return true;
    if (!contentId || !au?.groupIds?.includes(contentId)) return false;
    if (contentType === "groupAnnouncement" && !au.leaderGroupIds?.includes(contentId)) return false;
    // Lazy import: the gateway chain pulls in DB/env modules the unit-test harness doesn't stub.
    const { getMembershipModuleGateway } = await import("../../../shared/modules/MembershipModuleGateway.js");
    const group = await getMembershipModuleGateway().loadGroup(au.churchId, contentId);
    if (!group) return false;
    return this.feedEnabled(contentType === "groupAnnouncement" ? group.announcementsEnabled : group.discussionsEnabled);
  }

  // loadGroup hands back the raw row, so a toggle may arrive as a boolean, a 0/1 number, or be
  // missing entirely (pre-migration rows). Only an explicit off value disables the feed.
  private feedEnabled(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    return !(value === false || value === 0 || value === "0");
  }

  protected isGroupFeed(contentType?: string) {
    return contentType === "group" || contentType === "groupAnnouncement";
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
