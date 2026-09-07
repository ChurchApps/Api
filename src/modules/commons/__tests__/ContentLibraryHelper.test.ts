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
import { isPublicDiskFilePath } from "../../content/helpers/PublicFileAccess.js";

const asset = { id: "testasst001", assetType: "song" };
const SUB = "testsubm001";
const pendingKey = ContentLibraryHelper.pendingKey(SUB, "demoAudio.wav");
const liveKey = ContentLibraryHelper.liveKey(asset, "demoAudio.wav");

afterEach(() => {
  for (const k of [pendingKey, liveKey]) {
    try { fs.unlinkSync(path.resolve("content", k)); } catch { /* gone */ }
  }
});

describe("storage keys", () => {
  it("derives id-keyed live keys and submission-keyed pending keys", () => {
    expect(liveKey).toBe("commons/assets/song/testasst001/demoAudio.wav");
    expect(ContentLibraryHelper.liveKey({ id: "x", assetType: "freeshow/template" }, "content.fstemplate")).toBe("commons/assets/freeshow/template/x/content.fstemplate");
    expect(pendingKey).toBe("commons/pending/testsubm001/demoAudio.wav");
  });

  it("serves live keys publicly and never anything under pending", () => {
    expect(isPublicDiskFilePath(`/${liveKey}`)).toBe(true);
    expect(isPublicDiskFilePath(`/${pendingKey}`)).toBe(false);
    expect(isPublicDiskFilePath("/commons/pending/../assets/song/x/y.mp3")).toBe(false);
  });

  it("maps live files to role → public URL", () => {
    const urls = ContentLibraryHelper.fileUrls(asset, [{ name: "tune.abc" }, { name: "demoAudio.wav" }, { name: "art-thumb.webp" }], "commons/writers/a.jpg");
    expect(urls).toEqual({
      abc: `${CONTENT_ROOT}/commons/assets/song/testasst001/tune.abc`,
      demoAudio: `${CONTENT_ROOT}/commons/assets/song/testasst001/demoAudio.wav`,
      thumb: `${CONTENT_ROOT}/commons/assets/song/testasst001/art-thumb.webp`,
      portrait: `${CONTENT_ROOT}/commons/writers/a.jpg`
    });
  });
});

describe("promotion and signed access", () => {
  it("copies a pending object to its live key and reports a missing source", async () => {
    await ContentLibraryHelper.storePending(pendingKey, "audio/wav", Buffer.from("RIFF"));
    expect(await ContentLibraryHelper.exists(pendingKey)).toBe(true);
    expect(await ContentLibraryHelper.promote(pendingKey, liveKey)).toBe(true);
    expect(fs.readFileSync(path.resolve("content", liveKey)).toString()).toBe("RIFF");
    expect(await ContentLibraryHelper.promote(ContentLibraryHelper.pendingKey(SUB, "missing.wav"), liveKey)).toBe(false);
    await ContentLibraryHelper.removePrefix(ContentLibraryHelper.pendingPrefix(SUB));
    expect(await ContentLibraryHelper.exists(pendingKey)).toBe(false);
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
    const json: any = ContentLibraryHelper.songJson(song, [{ name: "demoAudio.wav" }, { name: "tune.mid" }]);
    expect(json.uploads).toEqual({ demoAudio: "demoAudio.wav" });
    expect(json.status).toBe("approved");
    expect(json.licenseVersion).toBeUndefined();
    const cc: any = ContentLibraryHelper.songJson({ ...song, license: "CC-BY", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/" } as any, []);
    expect(cc).toMatchObject({ license: "CC-BY", licenseVersion: "3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/" });
    expect(json.meter).toBe("8.7.8.7 D");
    expect(ContentLibraryHelper.renderChordpro(song)).toBe("{title: Hymn}\n{artist: Anon}\n{key: G}\n{time: 3/4}\n{tempo: 90}\n\nVerse 1\n[G]Sing\n");
  });
});
