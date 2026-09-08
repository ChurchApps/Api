import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({
  CommonsBaseController: class {
    json(obj: any, status: number) { return { obj, status }; }
    actionWrapperAnon(_req: any, _res: any, fn: any) { return fn(); }
  }
}));
const ROLES: Record<string, string> = { "score.musicxml": "score", "slides.json": "slides", "timing.json": "timing", "attribution.txt": "attribution", "lyrics.chordpro": "chart" };
jest.mock("../helpers/index", () => ({
  ChordProHelper: { slug: (t: string) => t },
  ContentLibraryHelper: {
    fileUrls: (asset: any, files: any[]) => Object.fromEntries(files.map((f) => [ROLES[f.name] || f.name, `http://c/${asset.id}/${f.name}`])),
    liveKey: (asset: any, name: string) => `commons/assets/song/${asset.id}/${name}`,
    readKey: jest.fn(async (key: string) => (key.endsWith("attribution.txt") ? { buffer: Buffer.from("Amazing Grace\nJohn Newton, 1779\nPublic domain.\n"), contentType: "text/plain" } : null))
  },
  DuplicateHelper: {},
  PublishHelper: { history: jest.fn(async () => [{ submissionId: "sub00000001", note: "Imported", filesChanged: [], fieldsChanged: [] }]) },
  recordAssetDownload: jest.fn(async () => 0),
  SubmissionHelper: {}
}));

import { CommonsSongController } from "../controllers/CommonsSongController.js";

const base = { language: "English", license: "PD", status: "published", writer: "John Newton", year: 1779, themes: "Grace,Salvation", meter: "CM", scripture: "Eph 2:8", songKey: "G", hasChords: 1, confidence: "converted-from-abc", featured: 0, rank: 50 };
const SONG: any = { ...base, id: "song0000001", title: "Amazing Grace", parentSongId: null, ratingCount: 4, ratingSum: 18, chordPro: "[G]x", qualityScore: 88, qualityDetail: "{}", proAnswer: "no", submittedBy: "u1", portraitKey: "commons/writers/n.jpg", scoreSource: "abc", publishedKeys: JSON.stringify(["G"]), rights: JSON.stringify({ text: { license: "PD" } }), form: null, listenedKeys: null };
const LIBRARY: any[] = [
  { ...base, id: "song0000001", title: "Amazing Grace", parentSongId: null },
  { ...base, id: "song0000002", title: "Amazing Grace (Spanish)", parentSongId: "song0000001", language: "Spanish" },
  { ...base, id: "song0000003", title: "Sublime Gracia", parentSongId: "song0000001" },
  { ...base, id: "song0000004", title: "Grace Greater", meter: "CM", scripture: "Eph 2:1", themes: "Grace", rank: 60 },
  { ...base, id: "song0000005", title: "Unrelated", meter: "LM", scripture: "John 3", themes: "Kids" }
];
const FILES: Record<string, any[]> = {
  song0000001: [{ name: "score.musicxml" }, { name: "slides.json" }, { name: "attribution.txt" }, { name: "lyrics.chordpro" }],
  song0000004: [{ name: "timing.json" }]
};

function songController(au: any) {
  const repos: any = {
    assetFile: { loadLiveMany: jest.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, FILES[id] || []]))), loadLive: jest.fn(async (id: string) => FILES[id] || []) },
    rating: { load: jest.fn(async () => ({ stars: 4 })) },
    song: {
      loadById: jest.fn(async (id: string) => (id === "song0000001" ? SONG : undefined)),
      loadFamily: jest.fn(async (root: string) => LIBRARY.filter((s) => s.id === root || s.parentSongId === root)),
      loadPublishedSummaries: jest.fn(async (filters: any) => LIBRARY.filter((s) => !filters?.language || s.language === filters.language)),
      loadContributors: jest.fn(async () => [{ name: "Ada", what: "correction", submissionId: "sub00000009" }])
    }
  };
  const controller = new CommonsSongController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}
const signedIn = { id: "user0000001", checkAccess: () => false };
const anon = { checkAccess: () => false };

describe("GET /commons/songs/:id/page", () => {
  it("returns song, rating with the caller's stars, history, family and explained similar songs", async () => {
    const { controller, repos } = songController(signedIn);
    const page: any = await controller.page({ params: { id: "song0000001" }, query: {} } as any, {} as any);
    expect(Object.keys(page)).toEqual(["song", "rating", "history", "family", "similar"]);
    expect(page.rating).toEqual({ average: 4.5, count: 4, mine: 4 });
    expect(page.history).toEqual([{ submissionId: "sub00000001", note: "Imported", filesChanged: [], fieldsChanged: [] }]);
    expect(page.family.map((f: any) => f.id)).toEqual(["song0000002", "song0000003"]);
    expect(page.family[0]).toMatchObject({ sundayReady: false, hasScore: false, fileUrls: {} });
    expect(page.similar.map((s: any) => [s.id, s.reason])).toEqual([["song0000004", "Same meter (CM), scripture from Eph and theme Grace."]]);
    expect(page.similar[0]).toMatchObject({ hasTiming: true, fileUrls: { timing: "http://c/song0000004/timing.json" } });
    expect(repos.song.loadPublishedSummaries).toHaveBeenCalledWith({ language: "English" });
    expect(repos.assetFile.loadLiveMany).toHaveBeenCalledTimes(2); // family + similar: one files query per list, never per song
  });

  it("carries the full detail: has* from the files, rights matrix, served attribution, contributors, no reviewer fields", async () => {
    const { controller } = songController(signedIn);
    const { song }: any = await controller.page({ params: { id: "song0000001" }, query: {} } as any, {} as any);
    expect(song).toMatchObject({
      id: "song0000001", rank: 50, confidence: "converted-from-abc", sundayReady: false, featured: false, hasChords: true, hasScore: true, hasSlides: true, hasTiming: false, hasAccompaniment: false,
      ccliReport: false, attribution: "Amazing Grace\nJohn Newton, 1779\nPublic domain.", publishedKeys: ["G"], listenedKeys: [], scoreSource: "abc", form: null, tune: null,
      contributors: [{ name: "Ada", what: "correction", submissionId: "sub00000009" }],
      fileUrls: { score: "http://c/song0000001/score.musicxml", slides: "http://c/song0000001/slides.json", attribution: "http://c/song0000001/attribution.txt", chart: "http://c/song0000001/lyrics.chordpro" }
    });
    expect(song.rights).toEqual({ text: { license: "PD" }, translation: null, tune: null, arrangement: null, recording: null, artwork: null });
    expect(song.rightsMatrix.project).toEqual({ allowed: true, conditions: [] });
    for (const k of ["qualityScore", "qualityDetail", "proAnswer", "submittedBy", "portraitKey"]) expect(song).not.toHaveProperty(k);
  });

  it("answers rating.mine null for an anonymous caller and 404 for an unknown song", async () => {
    const { controller, repos } = songController(anon);
    const page: any = await controller.page({ params: { id: "song0000001" }, query: {} } as any, {} as any);
    expect(page.rating).toEqual({ average: 4.5, count: 4, mine: null });
    expect(repos.rating.load).not.toHaveBeenCalled();
    expect(await controller.page({ params: { id: "nope" }, query: {} } as any, {} as any)).toEqual({ obj: {}, status: 404 });
  });
});

describe("GET /commons/songs query params", () => {
  it("forwards sundayReady, confidence, language and q to the repo, trimmed and bounded", async () => {
    const { controller, repos } = songController(anon);
    await controller.getAll({ query: { sundayReady: "true", confidence: "chart-only", language: "Spanish", q: "  grace  " } } as any, {} as any);
    expect(repos.song.loadPublishedSummaries).toHaveBeenCalledWith({ sundayReady: true, confidence: "chart-only", language: "Spanish", q: "grace" });
    await controller.getAll({ query: { q: "x".repeat(300) } } as any, {} as any);
    expect(repos.song.loadPublishedSummaries).toHaveBeenLastCalledWith({ sundayReady: false, confidence: undefined, language: undefined, q: "x".repeat(100) });
    await controller.getAll({} as any, {} as any);
    expect(repos.song.loadPublishedSummaries).toHaveBeenLastCalledWith({ sundayReady: false, confidence: undefined, language: undefined, q: undefined });
  });

  it("every list row carries the summary keys of the contract", async () => {
    const { controller } = songController(anon);
    const rows: any[] = await controller.getAll({ query: {} } as any, {} as any);
    const keys = ["confidence", "sundayReady", "featured", "firstLine", "tune", "hymnalCount", "hasChords", "hasScore", "hasSlides", "hasTiming", "hasAccompaniment", "recommendedKey", "singTimeSeconds", "fileUrls", "rank"];
    for (const r of rows) for (const k of keys) expect(r).toHaveProperty(k);
    expect(rows[0]).not.toHaveProperty("rights");
    expect(rows[0]).not.toHaveProperty("rightsMatrix");
  });
});
