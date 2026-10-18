import "reflect-metadata";

// Pairing codes are four letters, so pair must not be callable anonymously or without a cap, and a
// re-enrolled device must not keep the church it was paired to before.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, messaging: { admin: "messagingAdmin" } } }));
const mockConsume = jest.fn(async (_userId: string, _churchId: string) => true);
jest.mock("../../helpers/DevicePairRateLimiter.js", () => ({ DevicePairRateLimiter: { consume: (userId: string, churchId: string) => mockConsume(userId, churchId) } }));

import { DeviceController } from "../DeviceController.js";

const liveDevice = () => ({ id: "d1", deviceId: "tv1", appName: "FreePlay", pairingCode: "ABCD", secret: "s", lastActiveDate: new Date() });
const ANON = { id: "", churchId: "", personId: "", checkAccess: () => false };
const ADMIN = { id: "u1", churchId: "c1", personId: "p1", checkAccess: () => true };

function makeController(principal: any, device: any = liveDevice()) {
  const repo = {
    loadByPairingCode: jest.fn(async () => device),
    loadByDeviceId: jest.fn(async () => device),
    claim: jest.fn(async () => undefined),
    save: jest.fn(async (d: any) => d)
  };
  const controller = new DeviceController();
  (controller as any).repos = { device: repo };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(principal);
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repo };
}

const pairReq = { query: {}, headers: {} } as any;

describe("DeviceController.pair", () => {
  beforeEach(() => { mockConsume.mockReset(); mockConsume.mockResolvedValue(true); });

  it("refuses an anonymous caller and never claims the device", async () => {
    const { controller, repo } = makeController(ANON);
    const result: any = await controller.pair("ABCD", pairReq, {} as any);
    expect(result.status).toBe(401);
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it("refuses once the caller has used up its pairing attempts", async () => {
    mockConsume.mockResolvedValue(false);
    const { controller, repo } = makeController(ADMIN);
    const result: any = await controller.pair("ABCD", pairReq, {} as any);
    expect(result.status).toBe(429);
    expect(repo.loadByPairingCode).not.toHaveBeenCalled();
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it("counts the attempt against the signed-in user and church", async () => {
    const { controller } = makeController(ADMIN);
    await controller.pair("ABCD", pairReq, {} as any);
    expect(mockConsume).toHaveBeenCalledWith("u1", "c1");
  });

  it("still pairs a live code for a signed-in user", async () => {
    const { controller, repo } = makeController(ADMIN);
    const result: any = await controller.pair("ABCD", pairReq, {} as any);
    expect(result.success).toBe(true);
    expect(repo.claim).toHaveBeenCalledWith("d1", expect.objectContaining({ churchId: "c1", personId: "p1" }));
  });
});

describe("DeviceController.enrollAnon on a known device", () => {
  it("drops the church and person it was paired to", async () => {
    const paired = { ...liveDevice(), churchId: "c1", personId: "p1", contentType: "freeplayScreen", contentId: "sg1" };
    const { controller, repo } = makeController(ANON, paired);
    repo.loadByPairingCode.mockResolvedValue(null);
    await controller.enrollAnon({ body: { deviceId: "tv1" } } as any, {} as any);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: null, personId: null, contentType: null, contentId: null }));
  });
});
