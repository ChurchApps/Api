import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ YouTubeHelper: {}, VimeoHelper: {}, OpenAiHelper: {}, Environment: {} }));
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: {} }));
jest.mock("../../helpers/AnonymousRateLimiter", () => ({ AnonymousRateLimiter: {} }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { streamingServices: { edit: "streamingEdit" } } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({}) }));

import { SermonController } from "../SermonController.js";

function setup() {
  const repos = { sermon: { save: jest.fn(async (s: any) => ({ ...s, id: s.id || "s1" })) } };
  const au = { churchId: "c1", checkAccess: () => true };
  const controller: any = new SermonController();
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("SermonController POST / body shape", () => {
  it("accepts a single sermon object", async () => {
    const { controller, repos } = setup();
    const result = await controller.save({ body: { churchId: "c1", title: "Week 1" } }, {});
    expect(result.status).toBe(200);
    expect(result.obj).toEqual([{ id: "s1", churchId: "c1", title: "Week 1" }]);
    expect(repos.sermon.save).toHaveBeenCalledTimes(1);
  });

  it("still accepts an array", async () => {
    const { controller } = setup();
    const result = await controller.save({ body: [{ churchId: "c1", title: "A" }, { churchId: "c1", title: "B", id: "s2" }] }, {});
    expect(result.obj).toHaveLength(2);
  });

  it("answers 400 for an empty body", async () => {
    const { controller, repos } = setup();
    const result = await controller.save({ body: undefined }, {});
    expect(result.status).toBe(400);
    expect(repos.sermon.save).not.toHaveBeenCalled();
  });
});
