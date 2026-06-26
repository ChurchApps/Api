/**
 * Unit tests for capturing a plan into a template snapshot and applying it back.
 * The helper takes repos explicitly, so in-memory fakes stand in for the DB and
 * the test runs without any external service.
 */

import { PlanTemplateHelper } from "../PlanTemplateHelper.js";

function makeRepos() {
  const planItems: any[] = [];
  const positions: any[] = [];
  const planItemTimes: any[] = [];
  const assignments: any[] = [];
  const plans: any[] = [];
  let seq = 0;
  const nextId = () => "new" + ++seq;
  const removeWhere = (arr: any[], pred: (r: any) => boolean) => {
    for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) arr.splice(i, 1);
  };
  return {
    _store: { planItems, positions, planItemTimes, assignments, plans },
    plan: { load: async (c: string, id: string) => plans.find((p) => p.churchId === c && p.id === id) || null },
    planItem: {
      loadForPlan: async (c: string, planId: string) => planItems.filter((i) => i.churchId === c && i.planId === planId).sort((a, b) => (a.sort || 0) - (b.sort || 0)),
      save: async (m: any) => { if (!m.id) m.id = nextId(); planItems.push(m); return m; },
      deleteByPlanId: async (c: string, planId: string) => removeWhere(planItems, (i) => i.churchId === c && i.planId === planId)
    },
    planItemTime: {
      deleteByPlanId: async (c: string, planId: string) => {
        const ids = planItems.filter((i) => i.churchId === c && i.planId === planId).map((i) => i.id);
        removeWhere(planItemTimes, (t) => ids.includes(t.planItemId));
      }
    },
    position: {
      loadByPlanId: async (c: string, planId: string) => positions.filter((p) => p.churchId === c && p.planId === planId),
      save: async (m: any) => { if (!m.id) m.id = nextId(); positions.push(m); return m; },
      deleteByPlanId: async (c: string, planId: string) => removeWhere(positions, (p) => p.churchId === c && p.planId === planId)
    },
    assignment: {
      deleteByPlanId: async (c: string, planId: string) => {
        const posIds = positions.filter((p) => p.churchId === c && p.planId === planId).map((p) => p.id);
        removeWhere(assignments, (a) => posIds.includes(a.positionId));
      }
    }
  } as any;
}

function seedSourcePlan(repos: any) {
  const c = "ch1";
  repos._store.plans.push({ churchId: c, id: "src", notes: "Welcome friends" });
  // two-level tree: H1 -> (I1, I2), H2 -> (I3)
  repos._store.planItems.push(
    { churchId: c, id: "H1", planId: "src", parentId: null, sort: 1, itemType: "header", label: "Worship", seconds: 0 },
    { churchId: c, id: "I1", planId: "src", parentId: "H1", sort: 1, itemType: "song", label: "Song A", seconds: 300 },
    { churchId: c, id: "I2", planId: "src", parentId: "H1", sort: 2, itemType: "song", label: "Song B", seconds: 240 },
    { churchId: c, id: "H2", planId: "src", parentId: null, sort: 2, itemType: "header", label: "Message", seconds: 0 },
    { churchId: c, id: "I3", planId: "src", parentId: "H2", sort: 1, itemType: "note", label: "Sermon", seconds: 1800 }
  );
  repos._store.positions.push(
    { churchId: c, id: "P1", planId: "src", categoryName: "Band", name: "Vocals", count: 3 },
    { churchId: c, id: "P2", planId: "src", categoryName: "Tech", name: "Sound", count: 1 }
  );
}

describe("PlanTemplateHelper", () => {
  it("captures a plan's notes, order tree and positions into a snapshot", async () => {
    const repos = makeRepos();
    seedSourcePlan(repos);

    const data = await PlanTemplateHelper.captureFromPlan(repos, "ch1", "src");

    expect(data.notes).toBe("Welcome friends");
    expect(data.items).toHaveLength(5);
    expect(data.positions).toHaveLength(2);
    const song = data.items!.find((i) => i.label === "Song A");
    expect(song.seconds).toBe(300);
    expect(song.parentId).toBe("H1"); // source-local key preserved in the snapshot
    expect(data.positions!.find((p) => p.name === "Vocals").count).toBe(3);
  });

  it("applies a snapshot to an empty plan, remapping parentId to new ids", async () => {
    const repos = makeRepos();
    seedSourcePlan(repos);
    repos._store.plans.push({ churchId: "ch1", id: "dst" });

    const data = await PlanTemplateHelper.captureFromPlan(repos, "ch1", "src");
    await PlanTemplateHelper.applyToPlan(repos, "ch1", "dst", data, { serviceOrder: true, positions: true });

    const dstItems = await repos.planItem.loadForPlan("ch1", "dst");
    expect(dstItems).toHaveLength(5);

    const headers = dstItems.filter((i: any) => !i.parentId);
    expect(headers.map((h: any) => h.label).sort()).toEqual(["Message", "Worship"]);

    const worship = dstItems.find((i: any) => i.label === "Worship");
    const children = dstItems.filter((i: any) => i.parentId === worship.id);
    expect(children.map((c: any) => c.label).sort()).toEqual(["Song A", "Song B"]);
    // remapped to a NEW id, never the source header id
    expect(worship.id).not.toBe("H1");
    expect(children.every((c: any) => c.parentId !== "H1")).toBe(true);

    const songA = dstItems.find((i: any) => i.label === "Song A");
    expect(songA.seconds).toBe(300);
    expect(songA.sort).toBe(1);

    const dstPositions = await repos.position.loadByPlanId("ch1", "dst");
    expect(dstPositions.find((p: any) => p.name === "Vocals").count).toBe(3);
  });

  it("replaces existing order of service when applying (does not append)", async () => {
    const repos = makeRepos();
    seedSourcePlan(repos);
    repos._store.plans.push({ churchId: "ch1", id: "dst" });
    repos._store.planItems.push({ churchId: "ch1", id: "OLD", planId: "dst", parentId: null, sort: 1, label: "Stale" });

    const data = await PlanTemplateHelper.captureFromPlan(repos, "ch1", "src");
    await PlanTemplateHelper.applyToPlan(repos, "ch1", "dst", data, { serviceOrder: true, positions: false });

    const dstItems = await repos.planItem.loadForPlan("ch1", "dst");
    expect(dstItems.some((i: any) => i.label === "Stale")).toBe(false);
    expect(dstItems).toHaveLength(5);
  });

  it("leaves positions untouched when positions is false", async () => {
    const repos = makeRepos();
    seedSourcePlan(repos);
    repos._store.plans.push({ churchId: "ch1", id: "dst" });
    repos._store.positions.push({ churchId: "ch1", id: "KEEP", planId: "dst", name: "Existing", count: 9 });

    const data = await PlanTemplateHelper.captureFromPlan(repos, "ch1", "src");
    await PlanTemplateHelper.applyToPlan(repos, "ch1", "dst", data, { serviceOrder: true, positions: false });

    const dstPositions = await repos.position.loadByPlanId("ch1", "dst");
    expect(dstPositions).toHaveLength(1);
    expect(dstPositions[0].name).toBe("Existing");
  });
});
