/** Issue #1296: a church with no time zone reads schedule blocks in its campus zone, not New York. */

jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: (): void => undefined,
  getProviderConfig: (): null => null,
  getProvider: (): null => null
}));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: async () => ({ id: "CHU1", name: "Church", subDomain: "church", timeZone: null as string | null }),
    loadCampusTimeZone: async () => "America/Chicago",
    loadGroup: async (): Promise<null> => null
  })
}));

import { ScreenManifestHelper } from "../ScreenManifestHelper.js";
import type { Repos } from "../../repositories/Repos.js";
import type { Playlist } from "../../models/index.js";

// Test doubles implement only the repo methods a test reads, with loose return shapes.
type FakeRepos = { [K in keyof Repos]?: { [M in keyof Repos[K]]?: Repos[K][M] extends (...args: infer A) => unknown ? (...args: A) => unknown : Repos[K][M] } };
const asRepos = (fake: FakeRepos) => fake as Repos;

const playlists: Record<string, Playlist> = {
  DEF: { id: "DEF", name: "Default loop", items: [{ id: "d", title: "Default", url: "https://cdn.example.com/d.png", seconds: 8 }] },
  P1: { id: "P1", name: "Kids", items: [{ id: "k", title: "Kids", url: "https://cdn.example.com/k.png", seconds: 8 }] }
};

const entries = [{ id: "A", screenGroupId: "G", targetType: "playlist", targetId: "P1", start: "2026-10-18T15:50:00", end: "2026-10-18T16:05:00", endBehavior: "loop", enabled: true }];

const repos = asRepos({
  screenGroup: { load: async () => ({ id: "G", name: "Kids Room", defaultPlaylistId: "DEF" }), convertToModel: <T>(_c: string, d: T) => d },
  playlist: { load: async (_c: string, id: string) => playlists[id], convertToModel: <T>(_c: string, d: T) => d },
  scheduleEntry: { loadByScreenGroupId: async () => entries, convertAllToModel: <T>(_c: string, d: T) => d }
});

describe("ScreenManifestHelper.build time zone", () => {
  it("uses the campus zone when the church has none", async () => {
    // 3:47 PM in Central: the 3:50-4:05 PM block is still ahead.
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "G", new Date("2026-10-18T20:47:00Z"));
    expect(manifest.occurrences.map((o) => o.start)).toEqual(["2026-10-18T20:50:00.000Z"]);
    expect(manifest.timeZone).toBe("America/Chicago");
  });
});
