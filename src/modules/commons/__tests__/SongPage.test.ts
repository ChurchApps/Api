import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({
  CommonsBaseController: class {
    json(obj: unknown, status: number) { return { obj, status }; }
    actionWrapperAnon(_req: unknown, _res: unknown, fn: () => Promise<unknown>) { return fn(); }
  }
}));
const ROLES: Record<string, string> = { "score.musicxml": "score", "slides.json": "slides", "timing.json": "timing", "attribution.txt": "attribution", "lyrics.chordpro": "chart" };
jest.mock("../helpers/index", () => ({
  ChordProHelper: { slug: (t: string) => t },
  ContentLibraryHelper: {
    fileUrls: (asset: { id?: string }, files: AssetFile[]) => Object.fromEntries(files.map((f) => [ROLES[f.name] || f.name, `http://c/${asset.id}/${f.name}`])),
    liveKey: (asset: { id?: string }, name: string) => `commons/assets/song/${asset.id}/${name}`,
    fileKey: (asset: { id?: string }, _files: AssetFile[], name: string) => `commons/assets/song/${asset.id}/${name}`,
    readKey: jest.fn(async (key: string) => (key.endsWith("attribution.txt") ? { buffer: Buffer.from("Amazing Grace\nJohn Newton, 1779\nPublic domain.\n"), contentType: "text/plain" } : null))
  },
  DuplicateHelper: {},
  PublishHelper: { history: jest.fn(async () => [{ submissionId: "sub00000001", note: "Imported", filesChanged: [] as string[], fieldsChanged: [] as string[] }]) },
  recordAssetDownload: jest.fn(async () => 0),
  SubmissionHelper: {}
}));

import type express from "express";
import { CommonsSongController } from "../controllers/CommonsSongController.js";
import type { Reviewer } from "../helpers/ReviewerHelper.js";
import type { AssetFile, SongView } from "../models/index.js";
import type { SongFilters } from "../repositories/SongRepo.js";

// MySQL hands tinyint flags back as 0/1, so the fixtures carry numbers where SongView says boolean.
type SongRow = Omit<SongView, "hasChords" | "featured"> & { hasChords?: number; featured?: number };
type Row = Record<string, unknown>;
type SongPageOut = { song: Row & { rightsMatrix: Record<string, unknown> }; history: unknown[]; family: Row[]; similar: Row[] };
const req = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

const base = { language: "English", license: "PD", status: "published", writer: "John Newton", year: 1779, themes: "Grace,Salvation", meter: "CM", scripture: "Eph 2:8", songKey: "G", hasChords: 1, confidence: "score", featured: 0, rank: 50, saveCount: 3, downloadCount: 12 };
const SONG: SongRow = { ...base, id: "song0000001", title: "Amazing Grace", parentSongId: null, chordPro: "[G]x", qualityScore: 88, qualityDetail: "{}", proAnswer: "no", submittedBy: "u1", portraitKey: "commons/writers/n.jpg", scoreSource: "abc", publishedKeys: JSON.stringify(["G"]), rights: JSON.stringify({ text: { license: "PD" } }), form: null, listenedKeys: null, contributors: JSON.stringify([{ name: "Ada", what: "correction", submissionId: "sub00000009" }]) };
const LIBRARY: SongRow[] = [
  { ...base, id: "song0000001", title: "Amazing Grace", parentSongId: null },
  { ...base, id: "song0000002", title: "Amazing Grace (Spanish)", parentSongId: "song0000001", language: "Spanish" },
  { ...base, id: "song0000003", title: "Sublime Gracia", parentSongId: "song0000001" },
  { ...base, id: "song0000004", title: "Grace Greater", meter: "CM", scripture: "Eph 2:1", themes: "Grace", rank: 60 },
  { ...base, id: "song0000005", title: "Unrelated", meter: "LM", scripture: "John 3", themes: "Kids" }
];
const FILES: Record<string, AssetFile[]> = {
  song0000001: [{ name: "score.musicxml" }, { name: "slides.json" }, { name: "attribution.txt" }, { name: "lyrics.chordpro" }],
  song0000004: [{ name: "timing.json" }]
};

function songController(au: Reviewer) {
  const repos = {
    assetFile: { loadLiveMany: jest.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, FILES[id] || []]))), loadLive: jest.fn(async (id: string) => FILES[id] || []) },
    song: {
      loadById: jest.fn(async (id: string) => (id === "song0000001" ? SONG : undefined)),
      loadFamily: jest.fn(async (root: string) => LIBRARY.filter((s) => s.id === root || s.parentSongId === root)),
      loadPublishedSummaries: jest.fn(async (filters: SongFilters) => LIBRARY.filter((s) => !filters?.language || s.language === filters.language))
    }
  };
  const controller = new CommonsSongController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (au: Reviewer) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}
const signedIn = { id: "user0000001", checkAccess: () => false };
const anon = { checkAccess: () => false };

describe("GET /commons/songs/:id/page", () => {
  it("returns song, history, family and explained similar songs — no ratings", async () => {
    const { controller, repos } = songController(signedIn);
    const page = (await controller.page(req({ params: { id: "song0000001" }, query: {} }), res)) as SongPageOut;
    expect(Object.keys(page)).toEqual(["song", "history", "family", "similar"]);
    expect(page).not.toHaveProperty("rating");
    expect(page.history).toEqual([{ submissionId: "sub00000001", note: "Imported", filesChanged: [], fieldsChanged: [] }]);
    expect(page.family.map((f) => f.id)).toEqual(["song0000002", "song0000003"]);
    expect(page.family[0]).toMatchObject({ sundayReady: false, hasScore: false, fileUrls: {} });
    expect(page.similar.map((s) => [s.id, s.reason])).toEqual([["song0000004", "Same meter (CM), scripture from Eph and theme Grace."]]);
    expect(page.similar[0]).toMatchObject({ hasTiming: true, fileUrls: { timing: "http://c/song0000004/timing.json" } });
    expect(repos.song.loadPublishedSummaries).toHaveBeenCalledWith({ language: "English" });
    expect(repos.assetFile.loadLiveMany).toHaveBeenCalledTimes(2); // family + similar: one files query per list, never per song
  });

  it("carries the full detail: has* from the files, rights matrix, served attribution, contributors, no reviewer fields", async () => {
    const { controller } = songController(signedIn);
    const { song } = (await controller.page(req({ params: { id: "song0000001" }, query: {} }), res)) as SongPageOut;
    expect(song).toMatchObject({
      id: "song0000001",
      rank: 50,
      confidence: "score",
      saveCount: 3,
      downloadCount: 12,
      sundayReady: false,
      featured: false,
      hasChords: true,
      hasScore: true,
      hasSlides: true,
      hasTiming: false,
      hasAccompaniment: false,
      ccliReport: false,
      attribution: "Amazing Grace\nJohn Newton, 1779\nPublic domain.",
      publishedKeys: ["G"],
      listenedKeys: [],
      scoreSource: "abc",
      form: null,
      tune: null,
      contributors: [{ name: "Ada", what: "correction", submissionId: "sub00000009" }],
      fileUrls: { score: "http://c/song0000001/score.musicxml", slides: "http://c/song0000001/slides.json", attribution: "http://c/song0000001/attribution.txt", chart: "http://c/song0000001/lyrics.chordpro" }
    });
    expect(song.rights).toEqual({ text: { license: "PD" }, translation: null, tune: null, arrangement: null, recording: null, artwork: null });
    expect(song.rightsMatrix.project).toEqual({ allowed: true, conditions: [] });
    for (const k of ["qualityScore", "qualityDetail", "proAnswer", "submittedBy", "portraitKey"]) expect(song).not.toHaveProperty(k);
  });

  it("404s an unknown song", async () => {
    const { controller } = songController(anon);
    expect(await controller.page(req({ params: { id: "nope" }, query: {} }), res)).toEqual({ obj: {}, status: 404 });
  });
});

describe("GET /commons/songs query params", () => {
  it("forwards sundayReady, confidence, language and q to the repo, trimmed and bounded", async () => {
    const { controller, repos } = songController(anon);
    await controller.getAll(req({ query: { sundayReady: "true", confidence: "chart-only", language: "Spanish", q: "  grace  " } }), res);
    expect(repos.song.loadPublishedSummaries).toHaveBeenCalledWith({ sundayReady: true, confidence: "chart-only", language: "Spanish", q: "grace" });
    await controller.getAll(req({ query: { q: "x".repeat(300) } }), res);
    expect(repos.song.loadPublishedSummaries).toHaveBeenLastCalledWith({ sundayReady: false, confidence: undefined, language: undefined, q: "x".repeat(100) });
    await controller.getAll(req({}), res);
    expect(repos.song.loadPublishedSummaries).toHaveBeenLastCalledWith({ sundayReady: false, confidence: undefined, language: undefined, q: undefined });
  });

  it("every list row carries the library fields and not the package files", async () => {
    const { controller } = songController(anon);
    const rows = (await controller.getAll(req({ query: {} }), res)) as Row[];
    const keys = [
      "confidence", "sundayReady", "hymnalCount", "hasChords", "hasScore", "hasSlides", "hasAccompaniment", "rank", "saveCount", "downloadCount"
    ];
    for (const r of rows) for (const k of keys) expect(r).toHaveProperty(k);
    expect(rows[0].hasScore).toBe(true);
    expect(rows[0]).not.toHaveProperty("fileUrls");
    expect(rows[0]).not.toHaveProperty("hasCover");
    expect(rows[0]).not.toHaveProperty("writerBio");
    expect(rows[0]).not.toHaveProperty("recommendedKey");
    expect(rows[0]).not.toHaveProperty("singTimeSeconds");
    expect(rows[0]).not.toHaveProperty("rights");
    expect(rows[0]).not.toHaveProperty("rightsMatrix");
  });
});
