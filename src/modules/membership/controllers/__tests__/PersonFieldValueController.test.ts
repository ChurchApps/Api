import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { people: { view: "peopleView", edit: "peopleEdit" } } }));
jest.mock("../../models/index", () => ({}));

import { PersonFieldValueController } from "../PersonFieldValueController.js";

function fieldValueController(access: string[]) {
  const rows = [{ id: "v1", churchId: "c1", personId: "p1", fieldId: "f1", value: "2024-05-01" }];
  const repos: any = {
    personFieldValue: {
      loadForField: jest.fn(async () => rows),
      convertAllToModel: jest.fn((_churchId: string, data: any[]) => data.map((d) => ({ ...d })))
    }
  };
  const au = { id: "u1", churchId: "c1", checkAccess: (perm: any) => access.includes(perm) };
  const controller = new PersonFieldValueController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos, rows };
}

// ChurchAppsSupport#1193: the People list loads a custom field's values for every person to show it as a column.
describe("PersonFieldValueController getForField", () => {
  it("returns the field's values scoped to the caller's church", async () => {
    const { controller, repos, rows } = fieldValueController(["peopleView"]);
    expect(typeof (controller as any).getForField).toBe("function");
    const result = await (controller as any).getForField("f1", {}, {});
    expect(repos.personFieldValue.loadForField).toHaveBeenCalledWith("c1", "f1");
    expect(repos.personFieldValue.convertAllToModel).toHaveBeenCalledWith("c1", rows);
    expect(result).toEqual(rows);
  });

  it("requires people view access", async () => {
    const { controller, repos } = fieldValueController([]);
    expect(typeof (controller as any).getForField).toBe("function");
    const result: any = await (controller as any).getForField("f1", {}, {});
    expect(result.status).toBe(401);
    expect(repos.personFieldValue.loadForField).not.toHaveBeenCalled();
  });
});
