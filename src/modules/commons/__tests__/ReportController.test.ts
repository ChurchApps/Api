import "reflect-metadata";
import type express from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import type { Asset, Report } from "../models/index.js";
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
const notifyReportReceived = jest.fn(async () => {});
const hits = new Map<string, number>();
const consumeRateLimit = jest.fn(async (buckets: { key: string; max: number }[]) => {
  if (buckets.some((b) => (hits.get(b.key) || 0) >= b.max)) return false;
  for (const b of buckets) hits.set(b.key, (hits.get(b.key) || 0) + 1);
  return true;
});
jest.mock("../helpers/index", () => ({ ipHash: jest.fn(() => "ip-unique"), clientIp: jest.fn(() => "1.2.3.4"), consumeRateLimit: (...a: Parameters<typeof consumeRateLimit>) => consumeRateLimit(...a), CommonsMailHelper: { notifyReportReceived } }));
jest.mock("../../../shared/helpers/Environment", () => ({ Environment: { currentEnvironment: "prod" } }));

import { CommonsReportController } from "../controllers/CommonsReportController.js";
import { ipHash } from "../helpers/index.js";

type JsonOut = { obj: unknown; status: number };
type CreateRequest = Parameters<CommonsReportController["create"]>[0];
const request = (r: Partial<CreateRequest>) => r as CreateRequest;
const res = {} as express.Response;

function reportController(signedIn = true) {
  const repos = {
    report: { create: jest.fn(async (r: Report): Promise<Report> => ({ ...r, id: "rep00000001" })) },
    asset: { loadById: jest.fn(async (id: string): Promise<Asset> => ({ id, name: "Old Hymn" })) }
  };
  const au: Partial<AuthenticatedUser> = signedIn
    ? { id: "user0000001", email: "writer@example.com", firstName: "Ada", lastName: "Crosby", checkAccess: () => false }
    : { checkAccess: () => false };
  const controller = new CommonsReportController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (u: AuthenticatedUser) => Promise<unknown>) => action(au as AuthenticatedUser),
    json: (obj: unknown, status: number): JsonOut => ({ obj, status })
  });
  return { controller, repos };
}

describe("CommonsReportController.create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ipHash as jest.Mock).mockReturnValue(`ip-${Math.random()}`);
  });

  it("lets a signed-in writer request removal with assetId and details only", async () => {
    const { controller, repos } = reportController();
    const result = await controller.create(request({ body: { reporterRole: "writer", assetId: "asset000001", details: "please take this down", reason: "copyright" } }), res);
    expect(result).toEqual({ id: "rep00000001" });
    expect(repos.report.create).toHaveBeenCalledWith(expect.objectContaining({
      assetId: "asset000001",
      details: "please take this down",
      reason: "copyright",
      reporterRole: "writer",
      reporterUserId: "user0000001",
      name: "Ada Crosby",
      email: "writer@example.com",
      contentText: "Old Hymn"
    }));
  });

  it("accepts reason=other for a writer request and still rate-limits", async () => {
    (ipHash as jest.Mock).mockReturnValue("ip-same");
    const { controller, repos } = reportController();
    await controller.create(request({ body: { reporterRole: "writer", assetId: "asset000001", details: "x", reason: "other" } }), res);
    expect(repos.report.create).toHaveBeenCalledWith(expect.objectContaining({ reason: "other" }));
    await controller.create(request({ body: { reporterRole: "writer", assetId: "asset000001", details: "y", reason: "other" } }), res);
    await controller.create(request({ body: { reporterRole: "writer", assetId: "asset000001", details: "z", reason: "other" } }), res);
    const limited = await controller.create(request({ body: { reporterRole: "writer", assetId: "asset000001", details: "nope", reason: "other" } }), res) as JsonOut;
    expect(limited.status).toBe(429);
  });

  it("acknowledges the reporter with the stored report, and skips the email on a rejected report", async () => {
    const { controller } = reportController(false);
    await controller.create(request({ body: { contentText: "Hymn", details: "stolen", reason: "copyright", name: "Rep Orter", email: "reporter@example.com", signature: "Rep Orter", reporterRole: "owner" } }), res);
    expect(notifyReportReceived).toHaveBeenCalledWith(expect.objectContaining({ id: "rep00000001", email: "reporter@example.com", contentText: "Hymn" }));
    notifyReportReceived.mockClear();
    await controller.create(request({ body: { contentText: "Hymn", details: "stolen", reason: "copyright" } }), res);
    expect(notifyReportReceived).not.toHaveBeenCalled();
  });

  it("still requires name, email and signature for anonymous copyright reports", async () => {
    const { controller, repos } = reportController(false);
    const result = await controller.create(request({ body: { contentText: "Hymn", details: "stolen", reason: "copyright" } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.report.create).not.toHaveBeenCalled();
  });

  it("limits reports per recipient email even across addresses", async () => {
    const { controller } = reportController(false);
    const body = { contentText: "Hymn", details: "d", reason: "ai", email: "victim@example.com" };
    for (let i = 0; i < 3; i++) await controller.create(request({ body }), res);
    const limited = await controller.create(request({ body }), res) as JsonOut;
    expect(limited.status).toBe(429);
  });
});
