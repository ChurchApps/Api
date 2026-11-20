import "reflect-metadata";

// Pairing codes are four letters, so pair must not be callable anonymously or without a cap, and a
// re-enrolled device must not keep the church it was paired to before.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, messaging: { admin: "messagingAdmin" } } }));
const mockConsume = jest.fn(async (_userId: string, _churchId: string) => true);
jest.mock("../../helpers/DevicePairRateLimiter.js", () => ({ DevicePairRateLimiter: { consume: (userId: string, churchId: string) => mockConsume(userId, churchId) } }));

import express from "express";
import { DeviceController } from "../DeviceController.js";
import { Device } from "../../models/index.js";

type PairResult = { status?: number; success?: boolean };

const liveDevice = (): Device => ({ id: "d1", deviceId: "tv1", appName: "FreePlay", pairingCode: "ABCD", secret: "s", lastActiveDate: new Date() });
const ANON = { id: "", churchId: "", personId: "", checkAccess: () => false };
const ADMIN = { id: "u1", churchId: "c1", personId: "p1", checkAccess: () => true };

function makeController(principal: typeof ADMIN, device: Device | null = liveDevice()) {
  const repo = {
    loadByPairingCode: jest.fn(async () => device),
    loadByDeviceId: jest.fn(async () => device),
    claim: jest.fn(async (): Promise<void> => undefined),
    save: jest.fn(async (d: Device) => d)
  };
  const controller = new DeviceController();
  Object.assign(controller, {
    repos: { device: repo },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof principal) => unknown) => action(principal),
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repo };
}

const pairReq = { query: {}, headers: {} } as express.Request<{}, {}, {}>;
const res = {} as express.Response;

describe("DeviceController.pair", () => {
  beforeEach(() => { mockConsume.mockReset(); mockConsume.mockResolvedValue(true); });

  it("refuses an anonymous caller and never claims the device", async () => {
    const { controller, repo } = makeController(ANON);
    const result = (await controller.pair("ABCD", pairReq, res)) as PairResult;
    expect(result.status).toBe(401);
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it("refuses once the caller has used up its pairing attempts", async () => {
    mockConsume.mockResolvedValue(false);
    const { controller, repo } = makeController(ADMIN);
    const result = (await controller.pair("ABCD", pairReq, res)) as PairResult;
    expect(result.status).toBe(429);
    expect(repo.loadByPairingCode).not.toHaveBeenCalled();
    expect(repo.claim).not.toHaveBeenCalled();
  });

  it("counts the attempt against the signed-in user and church", async () => {
    const { controller } = makeController(ADMIN);
    await controller.pair("ABCD", pairReq, res);
    expect(mockConsume).toHaveBeenCalledWith("u1", "c1");
  });

  it("still pairs a live code for a signed-in user", async () => {
    const { controller, repo } = makeController(ADMIN);
    const result = (await controller.pair("ABCD", pairReq, res)) as PairResult;
    expect(result.success).toBe(true);
    expect(repo.claim).toHaveBeenCalledWith("d1", expect.objectContaining({ churchId: "c1", personId: "p1" }));
  });
});

describe("DeviceController.enrollAnon on a known device", () => {
  it("drops the church and person it was paired to", async () => {
    const paired = { ...liveDevice(), churchId: "c1", personId: "p1", contentType: "freeplayScreen", contentId: "sg1" };
    const { controller, repo } = makeController(ANON, paired);
    repo.loadByPairingCode.mockResolvedValue(null);
    await controller.enrollAnon({ body: { deviceId: "tv1" } } as express.Request<{}, {}, Device>, res);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: null, personId: null, contentType: null, contentId: null }));
  });
});
