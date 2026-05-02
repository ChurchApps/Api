import { AuthenticatedUser } from "@churchapps/apihelper";
import { Permissions } from "./Permissions.js";
import { RepoManager } from "../infrastructure/RepoManager.js";

export class PlanAuth {
  static async canEditMinistry(au: AuthenticatedUser, ministryId: string | undefined | null): Promise<boolean> {
    if (au.checkAccess(Permissions.plans.edit)) return true;
    if (!ministryId || !au.personId) return false;
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const memberships = await membershipRepos.groupMember.loadForPerson(au.churchId, au.personId);
    return Array.isArray(memberships) && memberships.some((m: any) => m.groupId === ministryId);
  }

  static async canEditPlan(au: AuthenticatedUser, planId: string | undefined | null): Promise<boolean> {
    if (au.checkAccess(Permissions.plans.edit)) return true;
    if (!planId) return false;
    const doingRepos = await RepoManager.getRepos<any>("doing");
    const plan: any = await doingRepos.plan.load(au.churchId, planId);
    return PlanAuth.canEditMinistry(au, plan?.ministryId);
  }

  static async canEditPlanType(au: AuthenticatedUser, planTypeId: string | undefined | null): Promise<boolean> {
    if (au.checkAccess(Permissions.plans.edit)) return true;
    if (!planTypeId) return false;
    const doingRepos = await RepoManager.getRepos<any>("doing");
    const planType: any = await doingRepos.planType.load(au.churchId, planTypeId);
    return PlanAuth.canEditMinistry(au, planType?.ministryId);
  }

  static async canEditPosition(au: AuthenticatedUser, positionId: string | undefined | null): Promise<boolean> {
    if (au.checkAccess(Permissions.plans.edit)) return true;
    if (!positionId) return false;
    const doingRepos = await RepoManager.getRepos<any>("doing");
    const position: any = await doingRepos.position.load(au.churchId, positionId);
    return PlanAuth.canEditPlan(au, position?.planId);
  }
}
