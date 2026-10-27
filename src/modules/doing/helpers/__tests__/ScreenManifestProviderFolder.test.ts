/** Issue 1393: a provider-folder block (e.g. a SignPresenter playlist) is titled with the folder's name, not its raw path. */

const browse = jest.fn();
jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: () => undefined,
  getProviderConfig: () => null,
  getProvider: (id: string) => (id === "signpresenter"
    ? { name: "SignPresenter", requiresAuth: false, browse, getPlaylist: async () => [{ id: "f1", title: "Slide 1", url: "https://cdn.example.com/1.png", mediaType: "image", seconds: 8 }] }
    : null)
}));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: async () => ({ timeZone: "America/Chicago" }),
    loadGroup: async () => null
  })
}));

import { ScreenManifestHelper } from "../ScreenManifestHelper.js";

const entries = [{ id: "A", screenGroupId: "G", targetType: "providerFolder", providerId: "signpresenter", providerPath: "/playlists/8383735095", start: "2026-10-19T08:00:00", end: "2026-10-19T12:00:00", endBehavior: "loop", enabled: true }];

const repos: any = {
  screenGroup: { load: async () => ({ id: "G", name: "Lobby" }), convertToModel: (_c: string, d: any) => d },
  scheduleEntry: { loadByScreenGroupId: async () => entries, convertAllToModel: (_c: string, d: any) => d }
};

const now = new Date("2026-10-19T12:00:00Z");

describe("ScreenManifestHelper provider folder title", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    browse.mockReset();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it("uses the folder's name from the provider", async () => {
    browse.mockResolvedValue([
      { type: "folder", id: "111", title: "Adults", path: "/playlists/111" },
      { type: "folder", id: "8383735095", title: "FreePlay – Elementary Opening", path: "/playlists/8383735095" }
    ]);
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "G", now);
    expect(manifest.occurrences.length).toBeGreaterThan(0);
    expect(manifest.occurrences.map((o) => o.title)).toEqual(manifest.occurrences.map(() => "FreePlay – Elementary Opening"));
    expect(browse).toHaveBeenCalledWith("/playlists", null);
    expect(browse).toHaveBeenCalledTimes(1);
  });

  it("falls back to provider › last path segment when the lookup fails", async () => {
    browse.mockRejectedValue(new Error("down"));
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "G", now);
    expect(manifest.occurrences.length).toBeGreaterThan(0);
    expect(manifest.occurrences[0].title).toBe("SignPresenter › 8383735095");
  });
});
