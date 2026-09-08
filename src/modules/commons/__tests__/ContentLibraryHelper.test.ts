import * as fs from "fs";
import * as path from "path";

const CONTENT_ROOT = "http://localhost:8084/content";

jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
// apihelper is ESM-only; stand in a disk-backed store that mirrors its ./content layout
jest.mock("@churchapps/apihelper", () => {
  const nodeFs = jest.requireActual("fs");
  const nodePath = jest.requireActual("path");
  const resolve = (key: string) => nodePath.resolve("content", key);
  return {
    __esModule: true,
    FileStorageHelper: {
      store: async (key: string, _contentType: string, contents: Buffer) => {
        nodeFs.mkdirSync(nodePath.dirname(resolve(key)), { recursive: true });
        nodeFs.writeFileSync(resolve(key), contents);
      },
      remove: async (key: string) => nodeFs.unlinkSync(resolve(key)),
      list: async (prefix: string) => (nodeFs.existsSync(resolve(prefix)) ? nodeFs.readdirSync(resolve(prefix)) : [])
    }
  };
});
jest.mock("../../../shared/helpers/Environment", () => ({ Environment: { fileStore: "disk", contentRoot: CONTENT_ROOT, jwtSecret: "test-secret" } }));

import { ContentLibraryHelper } from "../helpers/ContentLibraryHelper.js";
import { findByBase, packagePath } from "../helpers/PackageLayout.js";
import { isPublicDiskFilePath } from "../../content/helpers/PublicFileAccess.js";

const asset = { id: "testasst001", assetType: "song" };
const SUB = "testsubm001";
const pendingKey = ContentLibraryHelper.pendingKey(SUB, "demoAudio.wav");
const liveKey = ContentLibraryHelper.liveKey(asset, "sources/demoAudio.wav");

afterEach(() => {
  for (const k of [pendingKey, liveKey]) {
    try { fs.unlinkSync(path.resolve("content", k)); } catch { /* gone */ }
  }
});

describe("storage keys", () => {
  it("derives id-keyed live keys with the package folder and flat submission-keyed pending keys", () => {
    expect(liveKey).toBe("commons/assets/song/testasst001/sources/demoAudio.wav");
    expect(ContentLibraryHelper.liveKey({ id: "x", assetType: "freeshow/template" }, "content.fstemplate")).toBe("commons/assets/freeshow/template/x/content.fstemplate");
    expect(pendingKey).toBe("commons/pending/testsubm001/demoAudio.wav");
  });

  it("places a flat song file by role: uploads in sources/, the person-owned files in masters/, generated ones in derivatives/, the manifest at the root", () => {
    for (const upload of ["demoAudio.wav", "sheetPdf.pdf", "stemsZip.zip", "tune.mid", "tune.abc", "score.musicxml", "lyrics.cho"]) expect(packagePath("song", upload)).toBe(`sources/${upload}`);
    for (const master of ["song.json", "lyrics.chordpro", "cover.webp", "art.png", "art.jpeg"]) expect(packagePath("song", master)).toBe(`masters/${master}`);
    for (const derived of [
      "slides.json", "chart.chordpro", "chart.pdf", "attribution.txt", "duration.json", "cover-thumb.webp", "timing.json", "sources.txt"
    ]) expect(packagePath("song", derived)).toBe(`derivatives/${derived}`);
    expect(packagePath("song", "art-thumb.webp")).toBe("derivatives/cover-thumb.webp");
    expect(packagePath("song", "manifest.json")).toBe("manifest.json");
    // already placed names and other asset types are left alone
    expect(packagePath("song", "masters/score.musicxml")).toBe("masters/score.musicxml");
    expect(packagePath("freeshow/template", "content.fstemplate")).toBe("content.fstemplate");
    expect(packagePath("freeshow/template", "thumb.png")).toBe("thumb.png");
  });

  it("finds the live file a flat name refers to by basename, across folders and the thumb rename", () => {
    const live = [{ id: "a", name: "derivatives/score.musicxml" }, { id: "b", name: "derivatives/cover-thumb.webp" }, { id: "c", name: "sources/demoAudio.mp3" }];
    expect(findByBase(live, "song", "score.musicxml")?.id).toBe("a");
    expect(findByBase(live, "song", "art-thumb.webp")?.id).toBe("b");
    expect(findByBase(live, "song", "demoAudio.mp3")?.id).toBe("c");
    expect(findByBase(live, "song", "tune.abc")).toBeUndefined();
    expect(findByBase([{ id: "t", name: "content.fstemplate" }], "freeshow/template", "content.fstemplate")?.id).toBe("t");
  });

  it("serves live keys publicly and never anything under pending", () => {
    expect(isPublicDiskFilePath(`/${liveKey}`)).toBe(true);
    expect(isPublicDiskFilePath(`/${pendingKey}`)).toBe(false);
    expect(isPublicDiskFilePath("/commons/pending/../assets/song/x/y.mp3")).toBe(false);
  });

  it("maps live files to role → public URL; the keys are roles, only the path carries the folder", () => {
    const urls = ContentLibraryHelper.fileUrls(asset, [{ name: "sources/tune.abc" }, { name: "sources/demoAudio.wav" }, { name: "derivatives/cover-thumb.webp" }], "commons/writers/a.jpg");
    expect(urls).toEqual({
      abc: `${CONTENT_ROOT}/commons/assets/song/testasst001/sources/tune.abc`,
      demoAudio: `${CONTENT_ROOT}/commons/assets/song/testasst001/sources/demoAudio.wav`,
      thumb: `${CONTENT_ROOT}/commons/assets/song/testasst001/derivatives/cover-thumb.webp`,
      portrait: `${CONTENT_ROOT}/commons/writers/a.jpg`
    });
    // a legacy flat name still resolves the same role
    expect(ContentLibraryHelper.fileUrls(asset, [{ name: "art-thumb.webp" }]).thumb).toBe(`${CONTENT_ROOT}/commons/assets/song/testasst001/art-thumb.webp`);
  });

  it("names the package derivatives by basename in any folder and lets the freshest file win a shared role", () => {
    const urls = ContentLibraryHelper.fileUrls(asset, [
      { name: "derivatives/chart.chordpro" }, { name: "masters/score.musicxml" }, { name: "derivatives/slides.json" }, { name: "derivatives/chart.pdf" }, { name: "derivatives/attribution.txt" }, { name: "derivatives/cover-thumb.webp" }, { name: "derivatives/duration.json" }, { name: "derivatives/timing.json" }
    ]);
    expect(Object.keys(urls).sort()).toEqual([
      "attribution", "chart", "chartPdf", "duration", "score", "slides", "thumb", "timing"
    ]);
    expect(urls.chart).toBe(`${CONTENT_ROOT}/commons/assets/song/testasst001/derivatives/chart.chordpro`);
    expect(urls.score).toBe(`${CONTENT_ROOT}/commons/assets/song/testasst001/masters/score.musicxml`);
    // masters/lyrics.chordpro is rewritten on every publish, so it outranks the pipeline chart whatever the listing order
    const both = ContentLibraryHelper.fileUrls(asset, [{ name: "derivatives/chart.chordpro" }, { name: "masters/lyrics.chordpro" }]);
    expect(both.chart).toContain("/masters/lyrics.chordpro");
    expect(ContentLibraryHelper.role("derivatives/chart.pdf")).toBe("chartPdf");
    expect(ContentLibraryHelper.role("sources/tune.abc")).toBe("abc");
    expect(ContentLibraryHelper.role("masters/song.json")).toBe("song");
    expect(ContentLibraryHelper.role("manifest.json")).toBe("manifest");
  });
});

describe("promotion and signed access", () => {
  it("copies a pending object to its live key inside the package folder and reports a missing source", async () => {
    await ContentLibraryHelper.storePending(pendingKey, "audio/wav", Buffer.from("RIFF"));
    expect(await ContentLibraryHelper.exists(pendingKey)).toBe(true);
    expect(await ContentLibraryHelper.promote(pendingKey, liveKey)).toBe(true);
    expect(fs.readFileSync(path.resolve("content", liveKey)).toString()).toBe("RIFF");
    expect(await ContentLibraryHelper.promote(ContentLibraryHelper.pendingKey(SUB, "missing.wav"), liveKey)).toBe(false);
    await ContentLibraryHelper.removePrefix(ContentLibraryHelper.pendingPrefix(SUB));
    expect(await ContentLibraryHelper.exists(pendingKey)).toBe(false);
  });

  it("removing the live prefix walks every package folder", async () => {
    const other = ContentLibraryHelper.liveKey(asset, "manifest.json");
    const derived = ContentLibraryHelper.liveKey(asset, "derivatives/slides.json");
    for (const k of [liveKey, other, derived]) await ContentLibraryHelper.store(k, "application/octet-stream", Buffer.from("x"));
    await ContentLibraryHelper.removePrefix(ContentLibraryHelper.livePrefix(asset));
    for (const k of [liveKey, other, derived]) expect(await ContentLibraryHelper.exists(k)).toBe(false);
  });

  it("signs pending-file urls that verify, and refuses tampered or expired ones", async () => {
    const url = await ContentLibraryHelper.signedPendingUrl(SUB, "demoAudio.wav", "http://api/");
    const { searchParams } = new URL(url);
    const exp = Number(searchParams.get("exp"));
    const sig = searchParams.get("sig") || "";
    expect(url.startsWith("http://api/commons/admin/pending-files/testsubm001/demoAudio.wav?")).toBe(true);
    expect(ContentLibraryHelper.verify(SUB, "demoAudio.wav", exp, sig)).toBe(true);
    expect(ContentLibraryHelper.verify(SUB, "other.wav", exp, sig)).toBe(false);
    expect(ContentLibraryHelper.verify(SUB, "demoAudio.wav", exp - 10000, sig)).toBe(false);
  });

  it("preview tokens are scoped to one submission", () => {
    const token = ContentLibraryHelper.previewToken(SUB);
    expect(ContentLibraryHelper.verifyPreviewToken(SUB, token)).toBe(true);
    expect(ContentLibraryHelper.verifyPreviewToken("other000001", token)).toBe(false);
    expect(ContentLibraryHelper.verifyPreviewToken(SUB, "garbage")).toBe(false);
  });

  it("the local upload target mirrors the presigned POST shape and demands auth", async () => {
    const upload = await ContentLibraryHelper.presignedUpload(SUB, "sheetPdf.pdf", "application/pdf", 1000, "http://api");
    expect(upload).toEqual({ url: "http://api/commons/submissions/testsubm001/upload/sheetPdf.pdf", fields: {}, method: "POST", authRequired: true });
  });
});

describe("song export artifacts", () => {
  it("song.json lists uploads by role and the chordpro header agrees with the metadata", () => {
    const song = { id: "testasst001", title: "Hymn", writer: "Anon", songKey: "G", timeSignature: "3/4", meter: "8.7.8.7 D", bpm: 90, chordPro: "Verse 1\n[G]Sing", license: "WC", language: "English" };
    const json: any = ContentLibraryHelper.songJson(song, [{ name: "sources/demoAudio.wav" }, { name: "sources/tune.mid" }]);
    expect(json.uploads).toEqual({ demoAudio: "demoAudio.wav" }); // basename: the content repo looks in sources/<name>
    expect(json.status).toBe("approved");
    expect(ContentLibraryHelper.songJson({ ...song, status: "unpublished" } as any, []).status).toBe("unpublished");
    const pkg: any = ContentLibraryHelper.songJson({ ...song, status: "published", confidence: "chart-only", rights: JSON.stringify({ text: { license: "WC" } }), form: null, publishedKeys: JSON.stringify(["G"]) } as any, []);
    expect(pkg).toMatchObject({ status: "approved", confidence: "chart-only", rights: { text: { license: "WC" } }, publishedKeys: ["G"] });
    expect(pkg.form).toBeUndefined();
    expect(json.licenseVersion).toBeUndefined();
    const cc: any = ContentLibraryHelper.songJson({ ...song, license: "CC-BY", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/" } as any, []);
    expect(cc).toMatchObject({ license: "CC-BY", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/" });
    expect(json.meter).toBe("8.7.8.7 D");
    expect(ContentLibraryHelper.renderChordpro(song)).toBe("{title: Hymn}\n{artist: Anon}\n{key: G}\n{time: 3/4}\n{tempo: 90}\n\nVerse 1\n[G]Sing\n");
  });
});
