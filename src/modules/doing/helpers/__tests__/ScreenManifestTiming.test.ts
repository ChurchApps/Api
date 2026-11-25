/** A slow FreePlay manifest build logs which provider step took the time (provider ids and counts only, never church, group, path or file). */

const getPlaylist = jest.fn();
jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: (): void => undefined,
  getProviderConfig: (): null => null,
  getProvider: (id: string) => (id === "signpresenter" ? { name: "SignPresenter", requiresAuth: false, getPlaylist } : null)
}));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: async () => ({ timeZone: "America/Chicago" }),
    loadGroup: async (): Promise<null> => null
  })
}));

import { ScreenManifestHelper } from "../ScreenManifestHelper.js";
import type { Repos } from "../../repositories/Repos.js";

// Test doubles implement only the repo methods a test reads, with loose return shapes.
type FakeRepos = { [K in keyof Repos]?: { [M in keyof Repos[K]]?: Repos[K][M] extends (...args: infer A) => unknown ? (...args: A) => unknown : Repos[K][M] } };
const asRepos = (fake: FakeRepos) => fake as Repos;

const entries = [{ id: "A", screenGroupId: "GRP9", targetType: "providerFolder", providerId: "signpresenter", providerPath: "/playlists/8383735095", start: "2026-10-19T08:00:00", end: "2026-10-19T12:00:00", endBehavior: "loop", enabled: true }];

const repos = asRepos({
  screenGroup: { load: async () => ({ id: "GRP9", name: "Lobby" }), convertToModel: <T>(_c: string, d: T) => d },
  scheduleEntry: { loadByScreenGroupId: async () => entries, convertAllToModel: <T>(_c: string, d: T) => d }
});

const now = new Date("2026-10-19T12:00:00Z");
const files = [{ id: "FILE77", title: "Slide 1", url: "https://cdn.example.com/1.png", mediaType: "image", seconds: 8 }];

describe("ScreenManifestHelper build timing", () => {
  let logSpy: jest.SpyInstance;
  const pendingMs = ScreenManifestHelper.pendingLogMs;
  const lines = () => logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("SLOW_MANIFEST"));

  beforeEach(() => {
    jest.useFakeTimers();
    getPlaylist.mockReset();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    logSpy.mockRestore();
    delete process.env.SLOW_REQUEST_MS;
    ScreenManifestHelper.pendingLogMs = pendingMs;
  });

  it("logs one line naming the slow provider step for a slow build", async () => {
    process.env.SLOW_REQUEST_MS = "20";
    getPlaylist.mockImplementation(async () => { jest.advanceTimersByTime(60); return files; });
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "GRP9", now);
    expect(manifest.occurrences[0].items.map((i) => i.title)).toEqual(["Slide 1"]);
    const out = lines();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^SLOW_MANIFEST \d+ms entries=1 occurrences=\d+ items=1 /);
    expect(out[0].split(" ")).toContain("files:signpresenter=1x/60ms");
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
    let release: (value: typeof files) => void;
    let called: () => void;
    const started = new Promise<void>((r) => { called = r; });
    getPlaylist.mockImplementation(() => { called(); return new Promise((r) => { release = r; }); });
    const build = ScreenManifestHelper.build(repos, "CHU1", "GRP9", now);
    await started;
    await jest.advanceTimersByTimeAsync(20);
    let out = lines();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^SLOW_MANIFEST_PENDING 20ms waiting=files:signpresenter=1 /);
    expect(out[0]).not.toContain("waiting=none");
    release(files);
    await build;
    out = lines();
    expect(out).toHaveLength(1);
    for (const secret of ["CHU1", "GRP9", "8383735095", "FILE77"]) expect(out[0]).not.toContain(secret);
  });
});
