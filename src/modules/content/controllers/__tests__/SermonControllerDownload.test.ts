import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  YouTubeHelper: {},
  VimeoHelper: {},
  OpenAiHelper: {},
  Environment: { contentRoot: "https://content.test" }
}));
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: {}, EnvironmentBase: { fileStore: "S3" } }));
jest.mock("../../helpers/PersonFileStorage", () => ({ PersonFileStorage: { s3DownloadUrl: jest.fn(async (key: string, name: string) => "https://s3.test/" + key + "?name=" + encodeURIComponent(name)) } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { streamingServices: { edit: "streamingEdit" } } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({}) }));

import { SermonController } from "../SermonController.js";
import { PersonFileStorage } from "../../helpers/PersonFileStorage.js";

const past = new Date("2026-01-01T00:00:00Z");
const sermons: Record<string, object> = {
  s1: { id: "s1", churchId: "c1", title: "Hope: Part 1", audioUrl: "https://content.test/c1/files/sermon/s1/hope.mp3", publishDate: past },
  s2: { id: "s2", churchId: "c1", title: "External", audioUrl: "https://ccdeltapa.subspla.sh/abc", publishDate: past },
  s3: { id: "s3", churchId: "c1", title: "Video only", videoUrl: "https://www.youtube.com/embed/x", publishDate: past },
  s4: { id: "s4", churchId: "c1", title: "Future", audioUrl: "https://content.test/c1/files/sermon/s4/f.mp3", publishDate: new Date(Date.now() + 86400000) },
  s5: { id: "s5", churchId: "c1", title: "Person file", audioUrl: "https://content.test/c1/files/person/per1/baptism.pdf", publishDate: past },
  s6: { id: "s6", churchId: "c1", title: "Other church", audioUrl: "https://content.test/c2/files/sermon/s9/other.mp3", publishDate: past },
  s7: { id: "s7", churchId: "c1", title: "Traversal", audioUrl: "https://content.test/c1/files/sermon/../person/per1/baptism.pdf", publishDate: past },
  s8: { id: "s8", churchId: "c1", title: "Encoded traversal", audioUrl: "https://content.test/c1/files/sermon/%2E%2E/person/per1/baptism.pdf", publishDate: past }
};

const runDownload = async (sermonId: string) => {
  const controller = new SermonController();
  Object.assign(controller, {
    repos: { sermon: { loadById: jest.fn(async (id: string, churchId: string) => (churchId === "c1" ? sermons[id] : undefined)) } },
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action()
  });
  const res: Partial<express.Response> = { redirect: jest.fn(), set: jest.fn() };
  const result = await (controller as unknown as { download: (c: string, s: string, req: express.Request, res: express.Response) => Promise<unknown> })
    .download("c1", sermonId, { query: {} } as express.Request, res as express.Response);
  return { res, result };
};

describe("SermonController.download sermon audio", () => {
  beforeEach(() => jest.mocked(PersonFileStorage.s3DownloadUrl).mockClear());

  it("redirects an uploaded file to a signed link that saves under the sermon title", async () => {
    const { res } = await runDownload("s1");
    expect(PersonFileStorage.s3DownloadUrl).toHaveBeenCalledWith("/c1/files/sermon/s1/hope.mp3", "Hope: Part 1.mp3");
    expect(res.redirect).toHaveBeenCalledWith(302, "https://s3.test//c1/files/sermon/s1/hope.mp3?name=Hope%3A%20Part%201.mp3");
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("redirects an audio link on another host straight to that link", async () => {
    const { res } = await runDownload("s2");
    expect(PersonFileStorage.s3DownloadUrl).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, "https://ccdeltapa.subspla.sh/abc");
  });

  it.each([
    ["s5", "https://content.test/c1/files/person/per1/baptism.pdf"],
    ["s6", "https://content.test/c2/files/sermon/s9/other.mp3"],
    ["s7", "https://content.test/c1/files/sermon/../person/per1/baptism.pdf"],
    ["s8", "https://content.test/c1/files/sermon/%2E%2E/person/per1/baptism.pdf"]
  ])("does not sign a content file that is not this church's sermon upload (%s)", async (id, url) => {
    const { res } = await runDownload(id);
    expect(PersonFileStorage.s3DownloadUrl).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, url);
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("404s a sermon with no downloadable media, an unpublished sermon, or another church's sermon", async () => {
    for (const id of ["s3", "s4", "missing"]) {
      const { res, result } = await runDownload(id);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(result).toEqual({ obj: {}, status: 404 });
    }
  });
});
