/** A slow FreePlay manifest build logs which provider step took the time (provider ids and counts only, never church, group, path or file). */

const getPlaylist = jest.fn();
jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: () => undefined,
  getProviderConfig: () => null,
  getProvider: (id: string) => (id === "signpresenter" ? { name: "SignPresenter", requiresAuth: false, getPlaylist } : null)
}));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: async () => ({ timeZone: "America/Chicago" }),
    loadGroup: async () => null
  })
}));

import { ScreenManifestHelper } from "../ScreenManifestHelper.js";

const entries = [{ id: "A", screenGroupId: "GRP9", targetType: "providerFolder", providerId: "signpresenter", providerPath: "/playlists/8383735095", start: "2026-10-19T08:00:00", end: "2026-10-19T12:00:00", endBehavior: "loop", enabled: true }];

const repos: any = {
  screenGroup: { load: async () => ({ id: "GRP9", name: "Lobby" }), convertToModel: (_c: string, d: any) => d },
  scheduleEntry: { loadByScreenGroupId: async () => entries, convertAllToModel: (_c: string, d: any) => d }
};

const now = new Date("2026-10-19T12:00:00Z");
const files = [{ id: "FILE77", title: "Slide 1", url: "https://cdn.example.com/1.png", mediaType: "image", seconds: 8 }];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ScreenManifestHelper build timing", () => {
  let logSpy: jest.SpyInstance;
  const pendingMs = ScreenManifestHelper.pendingLogMs;
  const lines = () => logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("SLOW_MANIFEST"));

  beforeEach(() => {
    getPlaylist.mockReset();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.SLOW_REQUEST_MS;
    ScreenManifestHelper.pendingLogMs = pendingMs;
  });

  it("logs one line naming the slow provider step for a slow build", async () => {
    process.env.SLOW_REQUEST_MS = "20";
    getPlaylist.mockImplementation(async () => { await sleep(60); return files; });
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "GRP9", now);
    expect(manifest.occurrences[0].items.map((i) => i.title)).toEqual(["Slide 1"]);
    const out = lines();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^SLOW_MANIFEST \d+ms entries=1 occurrences=\d+ items=1 /);
    expect(out[0]).toMatch(/ files:signpresenter=1x\/\d+ms/);
    const ms = Number(out[0].match(/files:signpresenter=1x\/(\d+)ms/)[1]);
    expect(ms).toBeGreaterThanOrEqual(40);
    for (const secret of [
      "CHU1", "GRP9", "8383735095", "playlists", "FILE77", "cdn.example.com", "Lobby", "Slide"
    ]) expect(out[0]).not.toContain(secret);
  });

  it("logs nothing for a fast build", async () => {
    process.env.SLOW_REQUEST_MS = "5000";
    getPlaylist.mockResolvedValue(files);
    await ScreenManifestHelper.build(repos, "CHU1", "GRP9", now);
    expect(lines()).toHaveLength(0);
  });

  it("logs the step still waiting when a build runs past the pending mark, so a Lambda timeout still leaves a trace", async () => {
    process.env.SLOW_REQUEST_MS = "5000";
    ScreenManifestHelper.pendingLogMs = 20;
    getPlaylist.mockImplementation(async () => { await sleep(120); return files; });
    await ScreenManifestHelper.build(repos, "CHU1", "GRP9", now);
    const out = lines();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^SLOW_MANIFEST_PENDING \d+ms waiting=files:signpresenter=1 /);
    for (const secret of ["CHU1", "GRP9", "8383735095", "FILE77"]) expect(out[0]).not.toContain(secret);
  });
});
