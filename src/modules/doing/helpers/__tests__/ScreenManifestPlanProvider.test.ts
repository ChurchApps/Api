/** Tests a FreePlay screen scheduled to a plan type whose current plan is a GO Curriculum link with no plan items (#1310). */

const goPlaylist = jest.fn(async (path: string, auth: any) => (auth ? [{ id: "g1", title: "Elijah video", mediaType: "video", url: `https://go.example.com${path}/v1.mp4?sig=abc` }] : null));

jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: () => undefined,
  getProviderConfig: () => null,
  getProvider: (id: string) => (id === "gocurriculum" ? { requiresAuth: true, getPlaylist: goPlaylist } : null)
}));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: async () => ({ timeZone: "America/Chicago" }),
    loadGroup: async () => null
  })
}));

import { ScreenManifestHelper } from "../ScreenManifestHelper.js";
import { ProviderAuthHelper } from "../ProviderAuthHelper.js";

const entries = [{ id: "A", screenGroupId: "G", targetType: "planType", targetId: "PT1", start: "2026-10-19T08:00:00", end: "2026-10-19T12:00:00", endBehavior: "loop", enabled: true }];

const repos: any = {
  screenGroup: { load: async () => ({ id: "G", name: "Kids Room" }), convertToModel: (_c: string, d: any) => d },
  scheduleEntry: { loadByScreenGroupId: async () => entries, convertAllToModel: (_c: string, d: any) => d },
  planType: { load: async () => ({ id: "PT1", name: "Elementary" }) },
  plan: { loadCurrentByPlanTypeId: async () => ({ id: "PL1", churchId: "CHU1", name: "Oct 25", providerId: "gocurriculum", providerPlanId: "/elementary/c1/l1", contentType: "provider" }) },
  planItem: { loadForPlan: async () => [] as any[] }
};

const now = new Date("2026-10-19T12:00:00Z");

describe("ScreenManifestHelper.build with a GO Curriculum plan", () => {
  let getAuth: jest.SpyInstance;
  afterEach(() => getAuth?.mockRestore());

  it("fills the plan-type entry from the plan's provider using the church's login", async () => {
    getAuth = jest.spyOn(ProviderAuthHelper, "getAuth").mockResolvedValue({ access_token: "tok", refresh_token: "", token_type: "Bearer", created_at: 0, expires_in: 3600, scope: "" } as any);
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "G", now);
    expect(manifest.occurrences).toHaveLength(1);
    expect(manifest.occurrences[0].items).toEqual([expect.objectContaining({ title: "Elijah video", mediaType: "video", url: "https://go.example.com/elementary/c1/l1/v1.mp4?sig=abc", providerId: "gocurriculum", fileId: "g1" })]);
    expect(getAuth).toHaveBeenCalledWith(repos, "CHU1", null, "gocurriculum");
  });

  it("stays empty without throwing when the church has no GO login linked", async () => {
    getAuth = jest.spyOn(ProviderAuthHelper, "getAuth").mockResolvedValue(null);
    const manifest = await ScreenManifestHelper.build(repos, "CHU1", "G", now);
    expect(manifest.occurrences).toEqual([]);
  });
});
