// Capture/apply the reusable part of a plan (order of service, positions, notes)
// to and from a template's JSON snapshot. Repos are passed in so this stays
// DB-free and unit-testable.

export interface PlanTemplateData {
  notes?: string;
  items?: any[];
  positions?: any[];
}

export class PlanTemplateHelper {
  public static async captureFromPlan(repos: any, churchId: string, planId: string): Promise<PlanTemplateData> {
    const items = await repos.planItem.loadForPlan(churchId, planId);
    const positions = await repos.position.loadByPlanId(churchId, planId);
    const plan = await repos.plan.load(churchId, planId);
    return {
      notes: plan?.notes || "",
      items: (items || []).map((i: any) => ({
        id: i.id,
        parentId: i.parentId,
        sort: i.sort,
        itemType: i.itemType,
        relatedId: i.relatedId,
        label: i.label,
        description: i.description,
        seconds: i.seconds,
        link: i.link,
        providerId: i.providerId,
        providerPath: i.providerPath,
        providerContentPath: i.providerContentPath,
        thumbnailUrl: i.thumbnailUrl
      })),
      positions: (positions || []).map((p: any) => ({
        categoryName: p.categoryName,
        name: p.name,
        count: p.count,
        groupId: p.groupId,
        allowSelfSignup: p.allowSelfSignup,
        description: p.description
      }))
    };
  }

  public static async applyToPlan(repos: any, churchId: string, planId: string, data: PlanTemplateData, opts: { serviceOrder: boolean; positions: boolean }): Promise<void> {
    if (opts.serviceOrder) {
      await repos.planItemTime.deleteByPlanId(churchId, planId);
      await repos.planItem.deleteByPlanId(churchId, planId);
      await PlanTemplateHelper.createItems(repos, churchId, planId, data.items || []);
    }
    if (opts.positions) {
      await repos.assignment.deleteByPlanId(churchId, planId);
      await repos.position.deleteByPlanId(churchId, planId);
      for (const p of data.positions || []) {
        await repos.position.save({ ...p, id: undefined, churchId, planId });
      }
    }
  }

  // Two-pass create with parentId remap; mirrors PlanController.copyServiceOrderItems
  // but reads items from a list (the stored snapshot) instead of the source plan.
  private static async createItems(repos: any, churchId: string, planId: string, items: any[]): Promise<void> {
    const idMap = new Map<string, string>();
    for (const item of items.filter((i) => !i.parentId)) {
      const oldId = item.id;
      const saved = await repos.planItem.save({ ...item, id: undefined, churchId, planId, parentId: undefined });
      if (oldId) idMap.set(oldId, saved.id || "");
    }
    for (const item of items.filter((i) => i.parentId)) {
      const newParentId = idMap.get(item.parentId || "");
      if (!newParentId) continue;
      const oldId = item.id;
      const saved = await repos.planItem.save({ ...item, id: undefined, churchId, planId, parentId: newParentId });
      if (oldId) idMap.set(oldId, saved.id || "");
    }
  }
}
