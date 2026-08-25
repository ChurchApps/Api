// Capture/apply plan snapshots (service order, positions, notes) to templates.

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

  // Roots first, then each level whose parent already has a new id (section folders nest actions a level deeper).
  private static async createItems(repos: any, churchId: string, planId: string, items: any[]): Promise<void> {
    const idMap = new Map<string, string>();
    for (const item of items.filter((i) => !i.parentId)) {
      const oldId = item.id;
      const saved = await repos.planItem.save({ ...item, id: undefined, churchId, planId, parentId: undefined });
      if (oldId) idMap.set(oldId, saved.id || "");
    }
    let pending = items.filter((i) => i.parentId);
    while (pending.length > 0) {
      const ready = pending.filter((i) => idMap.has(i.parentId || ""));
      if (ready.length === 0) break;
      for (const item of ready) {
        const oldId = item.id;
        const saved = await repos.planItem.save({ ...item, id: undefined, churchId, planId, parentId: idMap.get(item.parentId) });
        if (oldId) idMap.set(oldId, saved.id || "");
      }
      pending = pending.filter((i) => !ready.includes(i));
    }
  }
}
