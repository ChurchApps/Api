import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../helpers/index", () => ({
  ChordProHelper: { slug: (t: string) => t },
  ContentLibraryHelper: { fileUrls: () => ({}) },
  DuplicateHelper: jest.requireActual("../helpers/DuplicateHelper").DuplicateHelper,
  recordAssetDownload: jest.fn(async () => 0),
  SubmissionHelper: {}
}));

import { CommonsSongController } from "../controllers/CommonsSongController.js";
import { DuplicateHelper } from "../helpers/DuplicateHelper.js";

const LIBRARY = [
  { id: "song0000001", title: "Amazing Grace", writer: "John Newton", chordPro: "{title: Amazing Grace}\n{key: G}\n\nVerse 1\n[G]Amazing grace! how [C]sweet the [G]sound,\nthat saved a wretch like [D]me!" },
  { id: "song0000002", title: "The Old Rugged Cross", writer: "George Bennard", chordPro: "Verse 1\n[Bb]On a hill far away stood an old rugged cross" },
  { id: "song0000003", title: "Every Valley", writer: "Playwright Composer", chordPro: "Chorus\n[D]Every valley shall be lifted" }
];

function songController() {
  const repos: any = { song: { loadPublishedForDuplicates: jest.fn(async () => LIBRARY) } };
  const controller = new CommonsSongController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  return { controller, repos };
}

const req = (query: any) => ({ query, params: {}, headers: {} } as any);

describe("DuplicateHelper", () => {
  it("folds case, punctuation and a leading article out of a title", () => {
    expect(DuplicateHelper.foldName("The Old Rugged Cross")).toBe("oldruggedcross");
    expect(DuplicateHelper.similarName("Amazing Grace!", "amazing grace")).toBe(true);
    expect(DuplicateHelper.similarName("Amazing Grace", "Amazing Grace (Live)")).toBe(true);
    expect(DuplicateHelper.similarName("Amazing Grace", "Every Valley")).toBe(false);
    expect(DuplicateHelper.similarName("", "Amazing Grace")).toBe(false);
  });

  it("reads the first sung line past directives, stanza labels and chords", () => {
    expect(DuplicateHelper.firstLine(LIBRARY[0].chordPro)).toBe("Amazing grace! how sweet the sound,");
    expect(DuplicateHelper.firstLine("Chorus\n[D]Every valley shall be lifted")).toBe("Every valley shall be lifted");
    expect(DuplicateHelper.firstLine("")).toBe("");
  });

  it("ranks a title-and-writer match above a title-only one", () => {
    const hits = DuplicateHelper.matches({ title: "Amazing Grace", writer: "John Newton" }, [...LIBRARY, { id: "song0000004", title: "Amazing Grace", writer: "Someone Else", chordPro: "" }]);
    expect(hits[0]).toEqual({ id: "song0000001", title: "Amazing Grace", writer: "John Newton" });
    expect(hits).toHaveLength(2);
  });
});

describe("GET /commons/songs/similar", () => {
  it("finds the published song behind a retitled submission by its first line", async () => {
    const { controller } = songController();
    const hits: any = await controller.similar(req({ title: "Grace Astounding", firstLine: "Amazing grace! how sweet the sound," }), {} as any);
    expect(hits).toEqual([{ id: "song0000001", title: "Amazing Grace", writer: "John Newton" }]);
  });

  it("finds it by title alone and reports nothing for an original song", async () => {
    const { controller } = songController();
    expect(await controller.similar(req({ title: "the old rugged cross" }), {} as any)).toEqual([{ id: "song0000002", title: "The Old Rugged Cross", writer: "George Bennard" }]);
    expect(await controller.similar(req({ title: "A Song Nobody Has Written Yet" }), {} as any)).toEqual([]);
  });

  it("does not read the library when there is nothing to match on", async () => {
    const { controller, repos } = songController();
    expect(await controller.similar(req({ writer: "John Newton" }), {} as any)).toEqual([]);
    expect(repos.song.loadPublishedForDuplicates).not.toHaveBeenCalled();
  });
});
