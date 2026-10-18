/** Tests the FreePlay screen manifest build: same manifest, one provider-auth lookup per provider instead of one per file. */

jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: () => undefined,
  getProviderConfig: () => null,
  getProvider: (id: string) => (id === "googledrive" ? { requiresAuth: true } : id === "publicfeed" ? { requiresAuth: false, getPlaylist: async () => [] } : null)
}));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: async () => ({ timeZone: "America/Chicago" }),
    loadGroup: async () => null
  })
}));

import { ScreenManifestHelper } from "../ScreenManifestHelper.js";
import { ProviderAuthHelper } from "../ProviderAuthHelper.js";

const driveItems = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, fileId: `${prefix}F${i}`, title: `${prefix} ${i}`, providerId: "googledrive", providerPath: "/", mediaType: "image", seconds: 8 }));

const playlists: Record<string, any> = {
  DEF: { id: "DEF", name: "Lobby loop", items: driveItems("d", 4) },
  P1: { id: "P1", name: "Morning", items: [...driveItems("m", 3), { id: "u1", title: "Logo", url: "https://cdn.example.com/logo.png", seconds: 5 }] },
  P2: { id: "P2", name: "Evening", items: driveItems("e", 2) }
};

const entries = [
  { id: "A", screenGroupId: "G", targetType: "playlist", targetId: "P1", start: "2026-10-19T08:00:00", end: "2026-10-19T12:00:00", endBehavior: "loop", enabled: true },
  { id: "B", screenGroupId: "G", targetType: "playlist", targetId: "P2", start: "2026-10-19T18:00:00", end: "2026-10-19T20:00:00", endBehavior: "fallback", enabled: true }
];

const repos: any = {
  screenGroup: { load: async () => ({ id: "G", name: "Lobby", defaultPlaylistId: "DEF" }), convertToModel: (_c: string, d: any) => d },
  playlist: { load: async (_c: string, id: string) => playlists[id], convertToModel: (_c: string, d: any) => d },
  scheduleEntry: { loadByScreenGroupId: async () => entries, convertAllToModel: (_c: string, d: any) => d }
};

const now = new Date("2026-10-19T12:00:00Z");

describe("ScreenManifestHelper.build", () => {
  let getAuth: jest.SpyInstance;
  beforeEach(() => {
    getAuth = jest.spyOn(ProviderAuthHelper, "getAuth").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 1));
      return { access_token: "tok", refresh_token: "", token_type: "Bearer", created_at: 0, expires_in: 3600, scope: "" } as any;
    });
  });
  afterEach(() => getAuth.mockRestore());

  it("builds the fallback and every occurrence with items in playlist order", async () => {
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "G", now);
    expect(manifest.screenGroupName).toBe("Lobby");
    expect(manifest.fallbackTitle).toBe("Lobby loop");
    expect(manifest.fallback.map((i) => i.title)).toEqual(["d 0", "d 1", "d 2", "d 3"]);
    expect(manifest.fallback[0]).toMatchObject({
      url: "https://www.googleapis.com/drive/v3/files/dF0?alt=media",
      headers: { Authorization: "Bearer tok" },
      mediaType: "image",
      seconds: 8,
      resolve: "url",
      providerId: "googledrive",
      fileId: "dF0"
    });
    const morning = manifest.occurrences.find((o) => o.title === "Morning");
    const evening = manifest.occurrences.find((o) => o.title === "Evening");
    expect(morning.items.map((i) => i.title)).toEqual(["m 0", "m 1", "m 2", "Logo"]);
    expect(morning.items[3]).toMatchObject({ url: "https://cdn.example.com/logo.png", headers: undefined, seconds: 5 });
    expect(evening.items.map((i) => i.fileId)).toEqual(["eF0", "eF1"]);
    expect(manifest.occurrences.map((o) => o.start)).toEqual([...manifest.occurrences.map((o) => o.start)].sort());
  });

  it("returns the same manifest (rev included) on a rebuild", async () => {
    const a = await ScreenManifestHelper.build(repos, "CHU1", "G", now);
    const b = await ScreenManifestHelper.build(repos, "CHU1", "G", now);
    expect(b).toEqual(a);
  });

  it("looks up a provider's auth once per build, not once per file", async () => {
    await ScreenManifestHelper.build(repos, "CHU1", "G", now);
    expect(getAuth).toHaveBeenCalledTimes(1);
    expect(getAuth).toHaveBeenCalledWith(repos, "CHU1", null, "googledrive");
  });
});
