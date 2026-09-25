import { BaseController } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";
import { Permissions } from "../helpers/index.js";
import { AuthenticatedUser } from "@churchapps/apihelper";

export class MembershipBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("membership");
  }

  public async formAccess(au: AuthenticatedUser, formId: string, access?: string): Promise<boolean> {
    if (!formId) return au.checkAccess(Permissions.forms.admin);
    if (!(await this.repos.form.load(au.churchId, formId))) return false;
    if (au.checkAccess(Permissions.forms.admin)) return true;

    const formData = (await this.repos.form.loadWithMemberPermissions(au.churchId, formId, au.personId)) as any;
    if (formData?.contentType === "form") return (formData as any).action === "admin" || (formData as any).action === access;
    if (au.checkAccess(Permissions.forms.edit)) return true;
    return false;
  }

  public async rolesInChurch(roleIds: string[], churchId: string): Promise<boolean> {
    const ids = [...new Set(roleIds.filter((id) => !!id))];
    if (ids.length === 0) return true;
    const roles = await this.repos.role.loadByIds(ids);
    return roles.length === ids.length && roles.every((r: any) => r.churchId === churchId);
  }
}
