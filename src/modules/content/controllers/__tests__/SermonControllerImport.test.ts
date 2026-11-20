import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
const getVideosFromChannel = jest.fn(async (_churchId: string, _channelId: string): Promise<Sermon[]> => []);
jest.mock("../../helpers/index", () => ({
  YouTubeHelper: { getVideosFromChannel: (...a: [string, string]) => getVideosFromChannel(...a) },
  VimeoHelper: { getVideosFromChannel: (...a: [string, string]) => getVideosFromChannel(...a) },
  OpenAiHelper: {},
  Environment: {}
}));
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: {} }));
jest.mock("../../helpers/AnonymousRateLimiter", () => ({ AnonymousRateLimiter: { consume: jest.fn(async () => true), ipBucket: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { streamingServices: { edit: "streamingEdit" } } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({}) }));

import { SermonController } from "../SermonController.js";
import { Sermon } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type TestUser = { churchId: string; checkAccess: (p: string) => boolean };
const req = {} as express.Request;
const res = {} as express.Response;

function makeController(access: string[]) {
  const controller = new SermonController();
  Object.assign(controller, {
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: TestUser) => unknown) => action({ churchId: "c1", checkAccess: (p: string) => access.includes(p) }),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return controller;
}

describe("SermonController channel import", () => {
  beforeEach(() => getVideosFromChannel.mockClear());

  it("requires streamingServices.edit", async () => {
    const yt = (await makeController([]).youtubeImport("UC1", req, res)) as JsonResult;
    const vm = (await makeController([]).vimeoImport("chan", req, res)) as JsonResult;
    expect(yt.status).toBe(401);
    expect(vm.status).toBe(401);
    expect(getVideosFromChannel).not.toHaveBeenCalled();
  });

  it("imports for staff with streamingServices.edit", async () => {
    await makeController(["streamingEdit"]).youtubeImport("UC1", req, res);
    expect(getVideosFromChannel).toHaveBeenCalledWith("c1", "UC1");
  });
});
