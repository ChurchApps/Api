import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  YouTubeHelper: {},
  VimeoHelper: {},
  OpenAiHelper: {},
  Environment: {}
}));
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: {} }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { streamingServices: { edit: "streamingEdit" } } }));
jest.mock("../../../../shared/modules/index", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: jest.fn(async () => ({ id: "c1", name: "Grace & Peace", subDomain: "grace" })),
    loadSetting: jest.fn(async () => "https://cdn.test/logo.png")
  })
}));

import { SermonController } from "../SermonController.js";
import { Setting } from "../../models/index.js";

const makeRes = () => {
  const res: Partial<express.Response> = { status: jest.fn(() => res as express.Response), send: jest.fn(), set: jest.fn() };
  return res;
};

const sermons = [
  { id: "s1", churchId: "c1", title: "Hope & Healing", description: "A <good> word", videoType: "youtube", videoUrl: "https://www.youtube.com/embed/abc", duration: 3725, publishDate: new Date("2026-09-01T00:00:00Z"), thumbnail: "https://cdn.test/s1.png" },
  { id: "s2", churchId: "c1", title: "Uploaded Audio", description: "", videoType: "custom", videoUrl: "https://www.youtube.com/embed/def", audioUrl: "https://cdn.test/s2.mp3", duration: 1800, publishDate: new Date("2026-08-25T00:00:00Z") },
  { id: "s3", churchId: "c1", title: "Direct Video", description: "", videoType: "custom", videoUrl: "https://cdn.test/s3.mp4", duration: 0 }
];

const runRss = async () => {
  const controller = new SermonController();
  Object.assign(controller, {
    repos: {
      sermon: { loadPublicAll: jest.fn(async () => sermons) },
      setting: { loadByKeyNames: jest.fn(async (): Promise<Setting[]> => []) }
    },
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action()
  });
  const res = makeRes();
  const query: express.Request["query"] = { siteUrl: "https://grace.b1.church/" };
  await controller.rss("c1", { query } as express.Request, res as express.Response);
  return { res, body: jest.mocked(res.send).mock.calls[0][0] as string };
};

describe("SermonController.rss podcast feed", () => {
  it("includes only sermons with a direct media file", async () => {
    const { body } = await runRss();
    expect(body).toContain("Uploaded Audio");
    expect(body).toContain("Direct Video");
    expect(body).not.toContain("Hope &amp; Healing");
  });

  it("emits enclosures with the right mime types", async () => {
    const { body } = await runRss();
    expect(body).toContain('<enclosure url="https://cdn.test/s2.mp3" type="audio/mpeg"');
    expect(body).toContain('<enclosure url="https://cdn.test/s3.mp4" type="video/mp4"');
  });

  it("emits the itunes namespace, channel tags and durations", async () => {
    const { res, body } = await runRss();
    expect(res.set).toHaveBeenCalledWith("Content-Type", "application/rss+xml");
    expect(body).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
    expect(body).toContain("<itunes:author>Grace &amp; Peace</itunes:author>");
    expect(body).toContain("<itunes:explicit>false</itunes:explicit>");
    expect(body).toContain('<itunes:category text="Religion &amp; Spirituality">');
    expect(body).toContain('<itunes:image href="https://cdn.test/logo.png" />');
    expect(body).toContain("<itunes:duration>30:00</itunes:duration>");
  });

  it("escapes xml and links to the site url without a trailing slash", async () => {
    const { body } = await runRss();
    expect(body).toContain("<title>Grace &amp; Peace</title>");
    expect(body).toContain("<link>https://grace.b1.church/sermons/s2</link>");
  });

  it("prefers the podcastTitle and podcastImage settings", async () => {
    const controller = new SermonController();
    Object.assign(controller, {
      repos: {
        sermon: { loadPublicAll: jest.fn(async () => sermons) },
        setting: { loadByKeyNames: jest.fn(async () => [{ keyName: "podcastTitle", value: "Grace Sermons" }, { keyName: "podcastImage", value: "https://cdn.test/pod.png" }]) }
      },
      actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action()
    });
    const res = makeRes();
    await controller.rss("c1", { query: {} } as express.Request, res as express.Response);
    const body = jest.mocked(res.send).mock.calls[0][0] as string;
    expect(body).toContain("<title>Grace Sermons</title>");
    expect(body).toContain('<itunes:image href="https://cdn.test/pod.png" />');
  });
});
