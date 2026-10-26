import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { tasks: { admin: "tasks.admin", view: "tasks.view" }, donations: { view: "donations.view" } } }));

import { ConditionController } from "../ConditionController.js";

function makeController(perms: string[], existing: any = null) {
  const repos: any = {
    condition: {
      save: jest.fn(async (c: any) => ({ ...c, id: c.id || "CON1" })),
      delete: jest.fn(),
      load: jest.fn(async () => existing)
    }
  };
  const au = { churchId: "CHU1", checkAccess: (p: string) => perms.includes(p) };
  const controller = new ConditionController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

const giving = { conjunctionId: "CNJ1", field: "giving", operator: "lapsed", fieldData: JSON.stringify({ regularWeeks: 12, minWeeks: 3, lapsedWeeks: 3 }) };

describe("ConditionController giving conditions", () => {
  it("rejects saving a giving condition without donations View", async () => {
    const { controller, repos } = makeController(["tasks.admin"]);
    const result: any = await (controller as any).save({ body: [giving] }, {});
    expect(result.status).toBe(401);
    expect(repos.condition.save).not.toHaveBeenCalled();
  });

  it("rejects changing an existing giving condition to another field without donations View", async () => {
    const { controller, repos } = makeController(["tasks.admin"], { id: "CON9", churchId: "CHU1", field: "giving" });
    const result: any = await (controller as any).save({ body: [{ id: "CON9", conjunctionId: "CNJ1", field: "displayName", operator: "=", value: "x" }] }, {});
    expect(result.status).toBe(401);
    expect(repos.condition.save).not.toHaveBeenCalled();
  });

  it("rejects deleting a giving condition without donations View", async () => {
    const { controller, repos } = makeController(["tasks.admin"], { id: "CON9", churchId: "CHU1", field: "giving" });
    const result: any = await (controller as any).delete("CON9", {}, {});
    expect(result.status).toBe(401);
    expect(repos.condition.delete).not.toHaveBeenCalled();
  });

  it("saves and deletes giving conditions for someone with tasks admin and donations View", async () => {
    const { controller, repos } = makeController(["tasks.admin", "donations.view"], { id: "CON9", churchId: "CHU1", field: "giving" });
    const saved: any = await (controller as any).save({ body: [giving] }, {});
    expect(saved[0]).toEqual(expect.objectContaining({ churchId: "CHU1", field: "giving" }));
    await (controller as any).delete("CON9", {}, {});
    expect(repos.condition.delete).toHaveBeenCalledWith("CHU1", "CON9");
  });

  it("still saves other conditions with only tasks admin", async () => {
    const { controller, repos } = makeController(["tasks.admin"]);
    await (controller as any).save({ body: [{ conjunctionId: "CNJ1", field: "displayName", operator: "=", value: "Donald" }] }, {});
    expect(repos.condition.save).toHaveBeenCalledTimes(1);
  });
});
