/** Tests a FreePlay screen scheduled to a plan type whose current plan is a GO Curriculum link, plain or customized (#1310). */

const goFiles = (path: string) => [
  { id: "g1", title: "Elijah video", mediaType: "video", url: `https://go.example.com${path}/v1.mp4?sig=abc` },
  { id: "g2", title: "Big Bible Story", mediaType: "video", url: `https://go.example.com${path}/v2.mp4?sig=abc`, seconds: 300 }
];
const goPlaylist = jest.fn(async (path: string, auth: any) => (auth ? goFiles(path).slice(0, 1) : null));
// GO's instructions are one play action per playlist file, each wrapping that file.
const goInstructions = jest.fn(async (path: string, auth: any) => (auth ? {
  name: "Elijah",
  items: goFiles(path).map((f) => ({ id: f.id + "-action", itemType: "action", label: f.title, children: [{ id: f.id, itemType: "file", label: f.title, downloadUrl: f.url, mediaType: f.mediaType, seconds: f.seconds }] }))
} : null));

jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: () => undefined,
  getProviderConfig: () => null,
  getProvider: (id: string) => (id === "gocurriculum" ? { requiresAuth: true, getPlaylist: goPlaylist, getInstructions: goInstructions } : null),
  navigateToPath: jest.requireActual("@churchapps/content-providers").navigateToPath
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

describe("ScreenManifestHelper.build with a customized GO Curriculum plan", () => {
  const lessonPath = "/elementary/c1/l1";
  const customized = [
    { id: "H1", parentId: null, sort: 1, itemType: "header", label: "Elijah vs. the Prophets of Baal" },
    { id: "I1", parentId: "H1", sort: 1, itemType: "providerPresentation", label: "Elijah video", providerId: "gocurriculum", providerPath: lessonPath, providerContentPath: "0" },
    { id: "I2", parentId: "H1", sort: 2, itemType: "providerPresentation", label: "Big Bible Story", providerId: "gocurriculum", providerPath: lessonPath, providerContentPath: "1" },
    { id: "I3", parentId: "H1", sort: 3, itemType: "providerFile", label: "ECHO MY GOD.mp4", seconds: 240, link: "https://cdn.example.com/echo.mp4" }
  ];
  const customizedRepos: any = { ...repos, planItem: { loadForPlan: async () => customized.map((i) => ({ ...i })) } };
  let getAuth: jest.SpyInstance;
  afterEach(() => getAuth?.mockRestore());

  it("plays the GO lesson items and the added item in plan order", async () => {
    getAuth = jest.spyOn(ProviderAuthHelper, "getAuth").mockResolvedValue({ access_token: "tok", refresh_token: "", token_type: "Bearer", created_at: 0, expires_in: 3600, scope: "" } as any);
    const manifest = await ScreenManifestHelper.build(customizedRepos, "CHU1", "G", now);
    expect(manifest.occurrences).toHaveLength(1);
    expect(manifest.occurrences[0].items.map((i) => i.title)).toEqual(["Elijah video", "Big Bible Story", "ECHO MY GOD.mp4"]);
    expect(manifest.occurrences[0].items[0]).toEqual(expect.objectContaining({ url: "https://go.example.com/elementary/c1/l1/v1.mp4?sig=abc", mediaType: "video", providerId: "gocurriculum", fileId: "g1" }));
    expect(manifest.occurrences[0].items[1]).toEqual(expect.objectContaining({ url: "https://go.example.com/elementary/c1/l1/v2.mp4?sig=abc", seconds: 300, fileId: "g2" }));
    expect(manifest.occurrences[0].items[2]).toEqual(expect.objectContaining({ url: "https://cdn.example.com/echo.mp4" }));
  });

  it("still plays the added item when the church has no GO login linked", async () => {
    getAuth = jest.spyOn(ProviderAuthHelper, "getAuth").mockResolvedValue(null);
    const manifest = await ScreenManifestHelper.build(customizedRepos, "CHU1", "G", now);
    expect(manifest.occurrences[0].items.map((i) => i.title)).toEqual(["ECHO MY GOD.mp4"]);
  });
});
