import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ YouTubeHelper: {}, VimeoHelper: {}, OpenAiHelper: {}, Environment: {} }));
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: {} }));
jest.mock("../../helpers/AnonymousRateLimiter", () => ({ AnonymousRateLimiter: {} }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { streamingServices: { edit: "streamingEdit" } } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({}) }));

import { SermonController } from "../SermonController.js";
import { Sermon } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
const res = {} as express.Response;
const save = async (controller: SermonController, body: unknown) => (await controller.save({ body } as express.Request, res)) as JsonResult;

function setup() {
  const repos = { sermon: { save: jest.fn(async (s: Sermon) => ({ ...s, id: s.id || "s1" })) } };
  const au = { churchId: "c1", checkAccess: () => true };
  const controller = new SermonController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("SermonController POST / body shape", () => {
  it("accepts a single sermon object", async () => {
    const { controller, repos } = setup();
    const result = await save(controller, { churchId: "c1", title: "Week 1" });
    expect(result.status).toBe(200);
    expect(result.obj).toEqual([{ id: "s1", churchId: "c1", title: "Week 1" }]);
    expect(repos.sermon.save).toHaveBeenCalledTimes(1);
  });

  it("still accepts an array", async () => {
    const { controller } = setup();
    const result = await save(controller, [{ churchId: "c1", title: "A" }, { churchId: "c1", title: "B", id: "s2" }]);
    expect(result.obj).toHaveLength(2);
  });

  it("answers 400 for an empty body", async () => {
    const { controller, repos } = setup();
    const result = await save(controller, undefined);
    expect(result.status).toBe(400);
    expect(repos.sermon.save).not.toHaveBeenCalled();
  });
});
