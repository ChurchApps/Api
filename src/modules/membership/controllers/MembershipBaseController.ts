import { BaseController } from "../../../shared/infrastructure";
import { Repos } from "../repositories";
import { Permissions } from "../helpers";
import { AuthenticatedUser } from "@churchapps/apihelper";

export class MembershipBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("membership");
  }

  public async formAccess(au: AuthenticatedUser, formId: string, access?: string): Promise<boolean> {
    if (au.checkAccess(Permissions.forms.admin)) return true;
    if (!formId) return false;

    const formData = (await this.repos.form.loadWithMemberPermissions(au.churchId, formId, au.personId)) as any;
    if (formData?.contentType === "form") return (formData as any).action === "admin" || (formData as any).action === access;
    if (au.checkAccess(Permissions.forms.edit)) return true;
    return false;
  }
}
