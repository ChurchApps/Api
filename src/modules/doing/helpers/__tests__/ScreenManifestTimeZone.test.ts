/** Issue #1296: a church with no time zone reads schedule blocks in its campus zone, not New York. */

jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: () => undefined,
  getProviderConfig: () => null,
  getProvider: () => null
}));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: async () => ({ id: "CHU1", name: "Church", subDomain: "church", timeZone: null }),
    loadCampusTimeZone: async () => "America/Chicago",
    loadGroup: async () => null
  })
}));

import { ScreenManifestHelper } from "../ScreenManifestHelper.js";

const playlists: Record<string, any> = {
  DEF: { id: "DEF", name: "Default loop", items: [{ id: "d", title: "Default", url: "https://cdn.example.com/d.png", seconds: 8 }] },
  P1: { id: "P1", name: "Kids", items: [{ id: "k", title: "Kids", url: "https://cdn.example.com/k.png", seconds: 8 }] }
};

const entries = [{ id: "A", screenGroupId: "G", targetType: "playlist", targetId: "P1", start: "2026-10-18T15:50:00", end: "2026-10-18T16:05:00", endBehavior: "loop", enabled: true }];

const repos: any = {
  screenGroup: { load: async () => ({ id: "G", name: "Kids Room", defaultPlaylistId: "DEF" }), convertToModel: (_c: string, d: any) => d },
  playlist: { load: async (_c: string, id: string) => playlists[id], convertToModel: (_c: string, d: any) => d },
  scheduleEntry: { loadByScreenGroupId: async () => entries, convertAllToModel: (_c: string, d: any) => d }
};

describe("ScreenManifestHelper.build time zone", () => {
  it("uses the campus zone when the church has none", async () => {
    // 3:47 PM in Central: the 3:50-4:05 PM block is still ahead.
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "G", new Date("2026-10-18T20:47:00Z"));
    expect(manifest.occurrences.map((o) => o.start)).toEqual(["2026-10-18T20:50:00.000Z"]);
    expect(manifest.timeZone).toBe("America/Chicago");
  });
});
