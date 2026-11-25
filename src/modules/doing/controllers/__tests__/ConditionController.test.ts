import "reflect-metadata";
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { tasks: { admin: "tasks.admin", view: "tasks.view" }, donations: { view: "donations.view" } } }));

import express from "express";
import { AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { Repos } from "../../repositories/index.js";
import { Condition } from "../../models/index.js";
import { ConditionController } from "../ConditionController.js";

type MockRepos = Record<string, Record<string, jest.Mock>>;
type JsonOut = { obj: unknown; status: number };
const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

// Permissions are mocked as plain strings, so perms holds those strings.
function makeController(perms: unknown[], existing: Partial<Condition> | null = null) {
  const repos: MockRepos = {
    condition: {
      save: jest.fn(async (c: Condition) => ({ ...c, id: c.id || "CON1" })),
      delete: jest.fn(),
      load: jest.fn(async () => existing)
    }
  };
  const au = { churchId: "CHU1", checkAccess: (p: IPermission) => perms.includes(p) };
  const controller = new ConditionController();
  controller.repos = Object.assign({} as Repos, repos);
  controller.actionWrapper = async (_req, _res, action) => action(au as AuthenticatedUser);
  return { controller, repos };
}

const giving = { conjunctionId: "CNJ1", field: "giving", operator: "lapsed", fieldData: JSON.stringify({ regularWeeks: 12, minWeeks: 3, lapsedWeeks: 3 }) };

describe("ConditionController giving conditions", () => {
  it("rejects saving a giving condition without donations View", async () => {
    const { controller, repos } = makeController(["tasks.admin"]);
    const result = (await controller.save(req({ body: [giving] }), res)) as JsonOut;
    expect(result.status).toBe(401);
    expect(repos.condition.save).not.toHaveBeenCalled();
  });

  it("rejects changing an existing giving condition to another field without donations View", async () => {
    const { controller, repos } = makeController(["tasks.admin"], { id: "CON9", churchId: "CHU1", field: "giving" });
    const result = (await controller.save(req({ body: [{ id: "CON9", conjunctionId: "CNJ1", field: "displayName", operator: "=", value: "x" }] }), res)) as JsonOut;
    expect(result.status).toBe(401);
    expect(repos.condition.save).not.toHaveBeenCalled();
  });

  it("rejects deleting a giving condition without donations View", async () => {
    const { controller, repos } = makeController(["tasks.admin"], { id: "CON9", churchId: "CHU1", field: "giving" });
    const result = (await controller.delete("CON9", req({}), res)) as JsonOut;
    expect(result.status).toBe(401);
    expect(repos.condition.delete).not.toHaveBeenCalled();
  });

  it("saves and deletes giving conditions for someone with tasks admin and donations View", async () => {
    const { controller, repos } = makeController(["tasks.admin", "donations.view"], { id: "CON9", churchId: "CHU1", field: "giving" });
    const saved = (await controller.save(req({ body: [giving] }), res)) as Condition[];
    expect(saved[0]).toEqual(expect.objectContaining({ churchId: "CHU1", field: "giving" }));
    await controller.delete("CON9", req({}), res);
    expect(repos.condition.delete).toHaveBeenCalledWith("CHU1", "CON9");
  });

  it("still saves other conditions with only tasks admin", async () => {
    const { controller, repos } = makeController(["tasks.admin"]);
    await controller.save(req({ body: [{ conjunctionId: "CNJ1", field: "displayName", operator: "=", value: "Donald" }] }), res);
    expect(repos.condition.save).toHaveBeenCalledTimes(1);
  });
});
