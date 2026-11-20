import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
const initialize = jest.fn((..._args: unknown[]): void => undefined);
const buildPrompt = jest.fn(async (text: string) => `prompt:${text}`);
const getCompletion = jest.fn(async (..._args: unknown[]) => [{ field: "firstName", value: "Ada", operator: "equals" }]);
jest.mock("../../helpers/index", () => ({
  Permissions: { people: { view: "peopleView", edit: "peopleEdit" } },
  OpenAiHelper: { initialize: (...a: unknown[]) => initialize(...a), buildPrompt: (...a: [string]) => buildPrompt(...a), getCompletion: (...a: unknown[]) => getCompletion(...a) },
  PersonHelper: {}
}));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getAllOperator: (arr: unknown[]) => arr } }));

import express from "express";
import { QueryController } from "../QueryController.js";
import { Person } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type QueryControllerOpts = { people?: Person[]; churchId?: string; access?: string[] };

const res = {} as express.Response;
const queryRequest = (body: Record<string, string>) => ({ body }) as express.Request<{}, {}, Record<string, string>>;

function queryController(opts: QueryControllerOpts = {}) {
  const people = opts.people ?? [{ id: "p1", firstName: "Ada", churchId: "c1" }];
  const repos = {
    person: {
      loadAll: jest.fn(async () => people),
      convertAllToModelWithPermissions: (_c: string, arr: Person[]) => arr
    }
  };
  const au = { churchId: opts.churchId ?? "c1", checkAccess: (perm: string) => (opts.access ?? []).includes(perm) };
  const controller = new QueryController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

beforeEach(() => {
  initialize.mockClear();
  buildPrompt.mockClear();
  getCompletion.mockClear();
});

describe("QueryController.queryMembers authorization", () => {
  it("rejects a JWT without people.view (401, no loadAll)", async () => {
    const { controller, repos } = queryController({ access: [] });
    const result = (await controller.queryMembers(queryRequest({ text: "all members", siteUrl: "https://evil.example", churchId: "other" }), res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.person.loadAll).not.toHaveBeenCalled();
    expect(getCompletion).not.toHaveBeenCalled();
  });

  it("allows a caller with people.view and loads people for the JWT church", async () => {
    const { controller, repos } = queryController({ access: ["peopleView"], churchId: "c1" });
    const result = await controller.queryMembers(queryRequest({ text: "first name Ada", siteUrl: "https://evil.example", churchId: "other" }), res);
    expect(repos.person.loadAll).toHaveBeenCalledWith("c1");
    expect(getCompletion).toHaveBeenCalledTimes(1);
    expect(getCompletion.mock.calls[0].length).toBe(1);
    expect(result).toEqual([{ id: "p1", firstName: "Ada", churchId: "c1" }]);
  });
});
