import { BaseController, RepoManager } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";

export class MessagingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("messaging");
  }

  // A MembershipApi permission (e.g. Group Members → Edit) isn't carried in the MessagingApi JWT,
  // so fall back to the user's MembershipApi role when the local token lacks the claim.
  protected async canAccessCrossApi(au: any, permission: { contentType: string; action: string }): Promise<boolean> {
    if (au.checkAccess(permission)) return true;
    if (!au.id || !au.churchId) return false;
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const userChurch = await membershipRepos.rolePermission.loadUserPermissionInChurch(au.id, au.churchId);
    const membershipApi = userChurch?.apis?.find((api: any) => api.keyName === "MembershipApi");
    return !!membershipApi?.permissions?.some((p: any) => {
      if (p.contentType === "Domain" && p.action === "Admin") return true;
      return p.contentType === permission.contentType && p.action === permission.action;
    });
  }
}
