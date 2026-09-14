import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/PodcastFeedHelper", () => {
  class PodcastFeedError extends Error { constructor(message: string, public status: number) { super(message); } }
  return { PodcastFeedError, PodcastFeedHelper: { load: jest.fn() } };
});

import { PodcastController } from "../PodcastController.js";
import { PodcastFeedError, PodcastFeedHelper } from "../../helpers/PodcastFeedHelper.js";

const mockedLoad = PodcastFeedHelper.load as jest.Mock;

const run = async (query: Record<string, unknown>) => {
  const controller = new PodcastController();
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  return (controller as any).feed({ query }, {});
};

describe("PodcastController.feed", () => {
  beforeEach(() => { mockedLoad.mockReset(); });

  it("returns the normalized feed for a url", async () => {
    mockedLoad.mockResolvedValue({ title: "Grace Community Podcast", episodes: [] });
    const result = await run({ url: " https://feeds.example.com/podcast.xml " });
    expect(mockedLoad).toHaveBeenCalledWith("https://feeds.example.com/podcast.xml");
    expect(result).toEqual({ title: "Grace Community Podcast", episodes: [] });
  });

  it("requires a url", async () => {
    expect(await run({})).toEqual({ obj: { error: "A feed url is required" }, status: 400 });
    expect(await run({ url: ["a", "b"] })).toEqual({ obj: { error: "A feed url is required" }, status: 400 });
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it("maps feed errors to their status and message", async () => {
    mockedLoad.mockRejectedValue(new PodcastFeedError("Feed URL host is not allowed", 400));
    expect(await run({ url: "http://localhost/feed" })).toEqual({ obj: { error: "Feed URL host is not allowed" }, status: 400 });
    mockedLoad.mockRejectedValue(new PodcastFeedError("Unable to load the podcast feed", 502));
    expect(await run({ url: "https://feeds.example.com/down.xml" })).toEqual({ obj: { error: "Unable to load the podcast feed" }, status: 502 });
  });

  it("lets unexpected errors bubble to the action wrapper", async () => {
    mockedLoad.mockRejectedValue(new Error("boom"));
    await expect(run({ url: "https://feeds.example.com/podcast.xml" })).rejects.toThrow("boom");
  });
});
