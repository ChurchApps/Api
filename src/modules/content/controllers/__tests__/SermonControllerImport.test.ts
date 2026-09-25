import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
const getVideosFromChannel = jest.fn(async () => []);
jest.mock("../../helpers/index", () => ({
  YouTubeHelper: { getVideosFromChannel: (...a: any[]) => (getVideosFromChannel as any)(...a) },
  VimeoHelper: { getVideosFromChannel: (...a: any[]) => (getVideosFromChannel as any)(...a) },
  OpenAiHelper: {},
  Environment: {}
}));
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: {} }));
jest.mock("../../helpers/AnonymousRateLimiter", () => ({ AnonymousRateLimiter: { consume: jest.fn(async () => true), ipBucket: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { streamingServices: { edit: "streamingEdit" } } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({}) }));

import { SermonController } from "../SermonController.js";

function makeController(access: string[]) {
  const controller = new SermonController();
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", checkAccess: (p: string) => access.includes(p) });
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return controller;
}

describe("SermonController channel import", () => {
  beforeEach(() => getVideosFromChannel.mockClear());

  it("requires streamingServices.edit", async () => {
    const yt: any = await makeController([]).youtubeImport("UC1", {} as any, {} as any);
    const vm: any = await makeController([]).vimeoImport("chan", {} as any, {} as any);
    expect(yt.status).toBe(401);
    expect(vm.status).toBe(401);
    expect(getVideosFromChannel).not.toHaveBeenCalled();
  });

  it("imports for staff with streamingServices.edit", async () => {
    await makeController(["streamingEdit"]).youtubeImport("UC1", {} as any, {} as any);
    expect(getVideosFromChannel).toHaveBeenCalledWith("c1", "UC1");
  });
});
