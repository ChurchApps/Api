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
  s1: { id: "s1", churchId: "c1", title: "Hope: Part 1", audioUrl: "https://content.test/c1/sermons/s1.mp3", publishDate: past },
  s2: { id: "s2", churchId: "c1", title: "External", audioUrl: "https://ccdeltapa.subspla.sh/abc", publishDate: past },
  s3: { id: "s3", churchId: "c1", title: "Video only", videoUrl: "https://www.youtube.com/embed/x", publishDate: past },
  s4: { id: "s4", churchId: "c1", title: "Future", audioUrl: "https://content.test/c1/sermons/s4.mp3", publishDate: new Date(Date.now() + 86400000) }
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
    expect(PersonFileStorage.s3DownloadUrl).toHaveBeenCalledWith("/c1/sermons/s1.mp3", "Hope: Part 1.mp3");
    expect(res.redirect).toHaveBeenCalledWith(302, "https://s3.test//c1/sermons/s1.mp3?name=Hope%3A%20Part%201.mp3");
    expect(res.set).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("redirects an audio link on another host straight to that link", async () => {
    const { res } = await runDownload("s2");
    expect(PersonFileStorage.s3DownloadUrl).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(302, "https://ccdeltapa.subspla.sh/abc");
  });

  it("404s a sermon with no downloadable media, an unpublished sermon, or another church's sermon", async () => {
    for (const id of ["s3", "s4", "missing"]) {
      const { res, result } = await runDownload(id);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(result).toEqual({ obj: {}, status: 404 });
    }
  });
});
