import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
const initialize = jest.fn();
const buildPrompt = jest.fn(async (text: string) => `prompt:${text}`);
const getCompletion = jest.fn(async () => [{ field: "firstName", value: "Ada", operator: "equals" }]);
jest.mock("../../helpers/index", () => ({
  Permissions: { people: { view: "peopleView", edit: "peopleEdit" } },
  OpenAiHelper: { initialize: (...a: any[]) => initialize(...a), buildPrompt: (...a: any[]) => buildPrompt(...a), getCompletion: (...a: any[]) => getCompletion(...a) },
  PersonHelper: {}
}));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getAllOperator: (arr: any[]) => arr } }));

import { QueryController } from "../QueryController.js";

function queryController(opts: any = {}) {
  const people = opts.people ?? [{ id: "p1", firstName: "Ada", churchId: "c1" }];
  const repos: any = {
    person: {
      loadAll: jest.fn(async () => people),
      convertAllToModelWithPermissions: (_c: string, arr: any[]) => arr
    }
  };
  const au = { churchId: opts.churchId ?? "c1", checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new QueryController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
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
    const result: any = await (controller as any).queryMembers({ body: { text: "all members", siteUrl: "https://evil.example", churchId: "other" } }, {});
    expect(result.status).toBe(401);
    expect(repos.person.loadAll).not.toHaveBeenCalled();
    expect(getCompletion).not.toHaveBeenCalled();
  });

  it("allows a caller with people.view and loads people for the JWT church", async () => {
    const { controller, repos } = queryController({ access: ["peopleView"], churchId: "c1" });
    const result = await (controller as any).queryMembers({ body: { text: "first name Ada", siteUrl: "https://evil.example", churchId: "other" } }, {});
    expect(repos.person.loadAll).toHaveBeenCalledWith("c1");
    expect(getCompletion).toHaveBeenCalledTimes(1);
    expect(getCompletion.mock.calls[0].length).toBe(1);
    expect(result).toEqual([{ id: "p1", firstName: "Ada", churchId: "c1" }]);
  });
});
