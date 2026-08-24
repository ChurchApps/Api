import * as fs from "fs";
import * as path from "path";

const CONTENT_ROOT = "http://localhost:8084/content";

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
import { SongView } from "../models/index.js";

const song: SongView = {
  id: "testpend001",
  title: "Pending Test Hymn",
  writer: "Tester",
  songKey: "G",
  timeSignature: "4/4",
  language: "English",
  license: "WC",
  chordPro: "Verse 1\n[G]Sing",
  status: "pending",
  submittedBy: "user0000001"
};

const pendingKey = `${ContentLibraryHelper.pendingFolderKey(song)}/tiny.wav`;
const publicDir = path.resolve("content", ContentLibraryHelper.folderKey(song));
const publicFile = path.join(publicDir, "tiny.wav");
const publicJson = path.join(publicDir, "song.json");
const publicLyrics = path.join(publicDir, "lyrics.chordpro");
const pendingFile = path.resolve("content", pendingKey);

afterEach(() => {
  for (const p of [pendingFile, publicFile, publicJson, publicLyrics]) {
    try { fs.unlinkSync(p); } catch { /* gone */ }
  }
});

describe("ContentLibraryHelper paths", () => {
  it("keeps the pending folder off the public library path", () => {
    expect(ContentLibraryHelper.pendingFolderKey(song)).toBe("commons/pending/testpend001");
    expect(ContentLibraryHelper.folderKey(song).startsWith("commons/pending/")).toBe(false);
    expect(ContentLibraryHelper.folderKey(song).startsWith("commons/songs/")).toBe(true);
    expect(ContentLibraryHelper.isPendingKey(pendingKey)).toBe(true);
    expect(ContentLibraryHelper.isPendingKey(ContentLibraryHelper.folderKey(song) + "/tiny.wav")).toBe(false);
  });

  it("serves approved library files publicly but never pending ones", () => {
    expect(isPublicDiskFilePath("/" + ContentLibraryHelper.folderKey(song) + "/tiny.wav")).toBe(true);
    expect(isPublicDiskFilePath("/" + pendingKey)).toBe(false);
    expect(isPublicDiskFilePath("/content/" + pendingKey)).toBe(false);
  });
});

describe("ContentLibraryHelper storage", () => {
  it("stores submitted files where the static server will not serve them", async () => {
    await ContentLibraryHelper.storePending(pendingKey, "audio/wav", Buffer.from("RIFF....WAVEfmt"));
    expect(fs.existsSync(pendingFile)).toBe(true);
    expect(fs.existsSync(publicFile)).toBe(false);
    expect(isPublicDiskFilePath("/" + pendingKey)).toBe(false);
  });

  it("hands reviewers signed API links, not public library paths", async () => {
    const reviewed = await ContentLibraryHelper.withReviewUrls({ ...song, demoAudioUrl: pendingKey }, "http://localhost:8084");
    expect(reviewed.demoAudioUrl).toMatch(/^http:\/\/localhost:8084\/commons\/admin\/pending-files\/testpend001\/demoAudio\?exp=\d+&sig=[0-9a-f]+$/);
    expect(reviewed.demoAudioUrl).not.toContain(pendingKey);
    const u = new URL(reviewed.demoAudioUrl || "");
    expect(ContentLibraryHelper.verifyPendingFile(song.id, "demoAudio", Number(u.searchParams.get("exp")), u.searchParams.get("sig") || "")).toBe(true);
    expect(ContentLibraryHelper.verifyPendingFile(song.id, "demoAudio", Number(u.searchParams.get("exp")), "deadbeef")).toBe(false);
  });

  it("publishes approved songs into the public library folder", async () => {
    await ContentLibraryHelper.storePending(pendingKey, "audio/wav", Buffer.from("RIFF....WAVEfmt"));
    const updates = await ContentLibraryHelper.publishSong({ ...song, status: "approved", demoAudioUrl: pendingKey });
    expect(updates.demoAudioUrl).toBe(`${CONTENT_ROOT}/${ContentLibraryHelper.folderKey(song)}/tiny.wav`);
    expect(fs.existsSync(publicFile)).toBe(true);
    expect(fs.existsSync(publicJson)).toBe(true);
    expect(fs.existsSync(pendingFile)).toBe(false);
    const json = JSON.parse(fs.readFileSync(publicJson, "utf8"));
    expect(json.status).toBe("approved");
    expect(json.uploads.demoAudio).toBe("tiny.wav");
  });

  it("removes pending and public objects on reject", async () => {
    await ContentLibraryHelper.storePending(pendingKey, "audio/wav", Buffer.from("RIFF....WAVEfmt"));
    await ContentLibraryHelper.publishSong({ ...song, status: "approved", demoAudioUrl: pendingKey });
    await ContentLibraryHelper.removeSongObjects({ ...song, demoAudioUrl: `${CONTENT_ROOT}/${ContentLibraryHelper.folderKey(song)}/tiny.wav` });
    expect(fs.existsSync(pendingFile)).toBe(false);
    expect(fs.existsSync(publicFile)).toBe(false);
    expect(fs.existsSync(publicJson)).toBe(false);
  });
});
