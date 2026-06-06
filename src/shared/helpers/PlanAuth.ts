import { AuthenticatedUser } from "@churchapps/apihelper";
import { Permissions } from "./Permissions.js";
import { getMembershipModuleGateway, getDoingModuleGateway } from "../modules/index.js";

export class PlanAuth {
  static async canEditMinistry(au: AuthenticatedUser, ministryId: string | undefined | null): Promise<boolean> {
    if (au.checkAccess(Permissions.plans.edit)) return true;
    if (!ministryId || !au.personId) return false;
    const memberships = await getMembershipModuleGateway().loadGroupMembersForPerson(au.churchId, au.personId);
    return Array.isArray(memberships) && memberships.some((m) => m.groupId === ministryId);
  }

  static async canEditPlan(au: AuthenticatedUser, planId: string | undefined | null): Promise<boolean> {
    if (au.checkAccess(Permissions.plans.edit)) return true;
    if (!planId) return false;
    const plan = await getDoingModuleGateway().loadPlan(au.churchId, planId);
    return PlanAuth.canEditMinistry(au, plan?.ministryId);
  }

  static async canEditPlanType(au: AuthenticatedUser, planTypeId: string | undefined | null): Promise<boolean> {
    if (au.checkAccess(Permissions.plans.edit)) return true;
    if (!planTypeId) return false;
    const planType = await getDoingModuleGateway().loadPlanType(au.churchId, planTypeId);
    return PlanAuth.canEditMinistry(au, planType?.ministryId);
  }

  static async canEditPosition(au: AuthenticatedUser, positionId: string | undefined | null): Promise<boolean> {
    if (au.checkAccess(Permissions.plans.edit)) return true;
    if (!positionId) return false;
    const position: any = await getDoingModuleGateway().loadPosition(au.churchId, positionId);
    return PlanAuth.canEditPlan(au, position?.planId);
  }
}
