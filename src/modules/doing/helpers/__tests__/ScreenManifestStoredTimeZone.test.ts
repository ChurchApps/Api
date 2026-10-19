/** Issue #1296: a stored church zone wins over the campus zone, and FreePlayAdmin reads the same zone the manifest uses. */

jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: () => undefined,
  getProviderConfig: () => null,
  getProvider: () => null
}));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: async () => ({ id: "CHU1", name: "Church", subDomain: "church", timeZone: "America/New_York" }),
    loadCampusTimeZone: async () => "America/Chicago",
    loadGroup: async () => null
  })
}));

import { ScreenManifestHelper } from "../ScreenManifestHelper.js";

const playlists: Record<string, any> = {
  DEF: { id: "DEF", name: "Default loop", items: [{ id: "d", title: "Default", url: "https://cdn.example.com/d.png", seconds: 8 }] },
  P1: { id: "P1", name: "Kids", items: [{ id: "k", title: "Kids", url: "https://cdn.example.com/k.png", seconds: 8 }] }
};

const entries = [{ id: "A", screenGroupId: "G", targetType: "playlist", targetId: "P1", start: "2026-10-19T07:58:00", end: "2026-10-19T08:09:00", endBehavior: "loop", enabled: true }];

const repos: any = {
  screenGroup: { load: async () => ({ id: "G", name: "Kids Room", defaultPlaylistId: "DEF" }), convertToModel: (_c: string, d: any) => d },
  playlist: { load: async (_c: string, id: string) => playlists[id], convertToModel: (_c: string, d: any) => d },
  scheduleEntry: { loadByScreenGroupId: async () => entries, convertAllToModel: (_c: string, d: any) => d }
};

describe("ScreenManifestHelper stored church time zone", () => {
  it("exposes the zone the manifest reads blocks in", async () => {
    await expect(ScreenManifestHelper.churchTimeZone("CHU1")).resolves.toBe("America/New_York");
  });

  it("reads blocks in the stored zone, so a Central 7:58 block has already ended at 12:57Z", async () => {
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "G", new Date("2026-10-19T12:57:00Z"));
    expect(manifest.timeZone).toBe("America/New_York");
    expect(manifest.occurrences).toEqual([]);
  });
});
