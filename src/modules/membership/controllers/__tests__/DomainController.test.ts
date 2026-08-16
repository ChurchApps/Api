import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { server: { admin: "serverAdmin" }, settings: { edit: "settingsEdit" } },
  CaddyHelper: {
    generateJsonData: jest.fn(async () => ({ apps: { http: { servers: { proxy: { routes: [] } } } } })),
    updateCaddy: jest.fn(async () => {}),
    initializeCaddy: jest.fn(async () => ({ success: true }))
  }
}));
jest.mock("../../helpers/DomainHealthHelper.js", () => ({
  DomainHealthHelper: { checkUncheckedDomains: jest.fn(async () => [{ id: "d1" }]) }
}));
jest.mock("../../models/index", () => ({}));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({}));

import { DomainController } from "../DomainController.js";
import { CaddyHelper } from "../../helpers/index.js";
import { DomainHealthHelper } from "../../helpers/DomainHealthHelper.js";

function domainController(opts: any = {}) {
  const repos: any = {
    domain: {
      loadByName: jest.fn(async () => opts.domainRow ?? { id: "d1", churchId: "c1", siteId: "s1", domainName: "x.com", subDomain: "firstchurch" }),
      loadPairs: jest.fn(async () => opts.pairs ?? [{ host: "x.com", dial: "firstchurch.b1.church:443" }])
    }
  };
  const au = { id: "u1", churchId: opts.auChurchId ?? "c1", checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new DomainController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

function req(headers: Record<string, string> = {}) {
  return { header: (name: string) => headers[name.toLowerCase()] };
}

describe("DomainController admin route authorization", () => {
  const prevKey = process.env.INTERNAL_API_KEY;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = prevKey;
    jest.clearAllMocks();
  });

  it("rejects caddy without server admin or internal key", async () => {
    delete process.env.INTERNAL_API_KEY;
    const { controller } = domainController({ access: [] });
    const result: any = await (controller as any).caddy(req(), {});
    expect(result.status).toBe(401);
    expect(CaddyHelper.generateJsonData).not.toHaveBeenCalled();
    expect(CaddyHelper.updateCaddy).not.toHaveBeenCalled();
  });

  it("rejects caddy/init, hostmap, and health without server admin or internal key", async () => {
    delete process.env.INTERNAL_API_KEY;
    const { controller, repos } = domainController({ access: [] });
    const init: any = await (controller as any).caddyInit(req(), {});
    const hostmap: any = await (controller as any).hostmap(req(), { set: jest.fn(), send: jest.fn() });
    const health: any = await (controller as any).runHealthCheck(req(), {});
    expect(init.status).toBe(401);
    expect(hostmap.status).toBe(401);
    expect(health.status).toBe(401);
    expect(CaddyHelper.initializeCaddy).not.toHaveBeenCalled();
    expect(repos.domain.loadPairs).not.toHaveBeenCalled();
    expect(DomainHealthHelper.checkUncheckedDomains).not.toHaveBeenCalled();
  });

  it("lets a server admin generate caddy JSON and update live routes", async () => {
    delete process.env.INTERNAL_API_KEY;
    const { controller } = domainController({ access: ["serverAdmin"] });
    const result: any = await (controller as any).caddy(req(), {});
    expect(CaddyHelper.generateJsonData).toHaveBeenCalled();
    expect(CaddyHelper.updateCaddy).toHaveBeenCalled();
    expect(result.apps).toBeDefined();
  });

  it("lets x-internal-key call hostmap without a JWT", async () => {
    process.env.INTERNAL_API_KEY = "edge-secret";
    const { controller, repos } = domainController({ access: [] });
    const res = { set: jest.fn(), send: jest.fn() };
    await (controller as any).hostmap(req({ "x-internal-key": "edge-secret" }), res);
    expect(repos.domain.loadPairs).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith("x.com firstchurch.b1.church");
  });

  it("rejects a wrong x-internal-key when the caller is not a server admin", async () => {
    process.env.INTERNAL_API_KEY = "edge-secret";
    const { controller } = domainController({ access: [] });
    const result: any = await (controller as any).caddyInit(req({ "x-internal-key": "nope" }), {});
    expect(result.status).toBe(401);
    expect(CaddyHelper.initializeCaddy).not.toHaveBeenCalled();
  });
});

describe("DomainController public lookup", () => {
  it("returns only subDomain and omits churchId and siteId", async () => {
    const { controller, repos } = domainController();
    const result: any = await (controller as any).getPublicByName("x.com", {}, {});
    expect(repos.domain.loadByName).toHaveBeenCalledWith("x.com");
    expect(result).toEqual({ subDomain: "firstchurch" });
    expect(result.churchId).toBeUndefined();
    expect(result.siteId).toBeUndefined();
  });

  it("returns an empty object when the domain is unknown", async () => {
    const { controller } = domainController({ domainRow: null });
    const result: any = await (controller as any).getPublicByName("gone.com", {}, {});
    expect(result).toEqual({});
  });
});
