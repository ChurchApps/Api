import { isPublicFile, isPublicDiskFilePath } from "../PublicFileAccess.js";

describe("isPublicFile", () => {
  it("treats website files as public", () => {
    expect(isPublicFile({ contentType: "website" })).toBe(true);
  });

  it("treats arrangement audio as public", () => {
    expect(isPublicFile({ contentType: "arrangement" })).toBe(true);
  });

  it("treats group and other files as private", () => {
    expect(isPublicFile({ contentType: "group" })).toBe(false);
    expect(isPublicFile({ contentType: "groupLeader" })).toBe(false);
    expect(isPublicFile({})).toBe(false);
    expect(isPublicFile(null)).toBe(false);
  });
});

describe("isPublicDiskFilePath", () => {
  it("allows website disk paths", () => {
    expect(isPublicDiskFilePath("/c1/files/logo.png")).toBe(true);
    expect(isPublicDiskFilePath("/c1/files/website/cid/logo.png")).toBe(true);
    expect(isPublicDiskFilePath("/content/c1/files/logo.png")).toBe(true);
  });

  it("allows arrangement disk paths", () => {
    expect(isPublicDiskFilePath("/c1/files/arrangement/a1/track.mp3")).toBe(true);
    expect(isPublicDiskFilePath("/content/c1/files/arrangement/a1/track.mp3")).toBe(true);
  });

  it("rejects private disk paths", () => {
    expect(isPublicDiskFilePath("/c1/files/group/g1/secret.pdf")).toBe(false);
    expect(isPublicDiskFilePath("/c1/files/groupLeader/g1/notes.pdf")).toBe(false);
    expect(isPublicDiskFilePath("/c1/files/group/g1/../website/x.png")).toBe(false);
    expect(isPublicDiskFilePath("/files/download/abc")).toBe(false);
    expect(isPublicDiskFilePath("/c1/files/group/g1/../arrangement/a1/track.mp3")).toBe(false);
  });
});
