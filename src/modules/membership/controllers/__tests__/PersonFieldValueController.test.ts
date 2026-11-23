import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { people: { view: "peopleView", edit: "peopleEdit" } } }));
jest.mock("../../models/index", () => ({}));

import type express from "express";
import { PersonFieldValueController } from "../PersonFieldValueController.js";
import { PersonFieldValue } from "../../models/index.js";

const req = {} as express.Request;
const res = {} as express.Response;

function fieldValueController(access: string[]) {
  const rows = [{ id: "v1", churchId: "c1", personId: "p1", fieldId: "f1", value: "2024-05-01" }];
  const repos = {
    personFieldValue: {
      loadForField: jest.fn(async () => rows),
      convertAllToModel: jest.fn((_churchId: string, data: PersonFieldValue[]) => data.map((d) => ({ ...d })))
    }
  };
  const au = { id: "u1", churchId: "c1", checkAccess: (perm: string) => access.includes(perm) };
  const controller = new PersonFieldValueController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos, rows };
}

// ChurchAppsSupport#1193: the People list loads a custom field's values for every person to show it as a column.
describe("PersonFieldValueController getForField", () => {
  it("returns the field's values scoped to the caller's church", async () => {
    const { controller, repos, rows } = fieldValueController(["peopleView"]);
    expect(typeof controller.getForField).toBe("function");
    const result = await controller.getForField("f1", req, res);
    expect(repos.personFieldValue.loadForField).toHaveBeenCalledWith("c1", "f1");
    expect(repos.personFieldValue.convertAllToModel).toHaveBeenCalledWith("c1", rows);
    expect(result).toEqual(rows);
  });

  it("requires people view access", async () => {
    const { controller, repos } = fieldValueController([]);
    expect(typeof controller.getForField).toBe("function");
    const result = (await controller.getForField("f1", req, res)) as { status: number };
    expect(result.status).toBe(401);
    expect(repos.personFieldValue.loadForField).not.toHaveBeenCalled();
  });
});
