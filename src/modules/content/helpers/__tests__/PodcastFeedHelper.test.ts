jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn() } }));

import axios from "axios";
import { PodcastFeedError, PodcastFeedHelper } from "../PodcastFeedHelper.js";
import { UrlValidator } from "../../../../shared/webhooks/UrlValidator.js";

const mockedGet = axios.get as jest.Mock;

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Grace Community Podcast</title>
    <description>Weekly conversations from Grace Community Church.</description>
    <link>https://grace.example.com</link>
    <itunes:author>Donald Clark</itunes:author>
    <itunes:image href="https://cdn.example.com/artwork.png"/>
    <item>
      <title>Walking Through Ruth</title>
      <description><![CDATA[<p>Donald Clark &amp; Sarah Miller open the book of Ruth.</p><p>Show notes at https://grace.example.com/ruth</p>]]></description>
      <enclosure url="https://cdn.example.com/audio/ep-2.mp3" length="3622261" type="audio/mpeg"/>
      <guid isPermaLink="false">ep-2-guid</guid>
      <pubDate>Sat, 05 Sep 2026 12:00:00 GMT</pubDate>
      <itunes:duration>00:47:33</itunes:duration>
      <itunes:episode>2</itunes:episode>
      <itunes:image href="https://cdn.example.com/ep-2.png"/>
    </item>
    <item>
      <title>Welcome to the Podcast</title>
      <itunes:summary>Our very first episode.</itunes:summary>
      <enclosure url="https://cdn.example.com/audio/ep-1.mp3" length="100" type="audio/mpeg"/>
      <guid>ep-1-guid</guid>
      <pubDate>Sat, 29 Aug 2026 12:00:00 GMT</pubDate>
      <itunes:duration>1800</itunes:duration>
      <itunes:episode>1</itunes:episode>
    </item>
    <item>
      <title>Blog post without audio</title>
      <link>https://grace.example.com/blog/1</link>
      <pubDate>not a date</pubDate>
      <itunes:duration>12:05</itunes:duration>
    </item>
  </channel>
</rss>`;

const okResponse = (data: string) => ({ status: 200, data, headers: {} });

describe("PodcastFeedHelper", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    PodcastFeedHelper.clearCache();
    jest.spyOn(UrlValidator, "resolvesToPrivate").mockImplementation(async (host: string) => host.endsWith(".internal-only.test"));
  });

  afterEach(() => { jest.restoreAllMocks(); });

  describe("parse", () => {
    it("normalizes channel and episode fields from an iTunes-style feed", () => {
      const feed = PodcastFeedHelper.parse(FEED_XML);
      expect(feed.title).toBe("Grace Community Podcast");
      expect(feed.author).toBe("Donald Clark");
      expect(feed.image).toBe("https://cdn.example.com/artwork.png");
      expect(feed.episodes).toHaveLength(3);

      const [ruth, first, blog] = feed.episodes;
      expect(ruth).toMatchObject({ guid: "ep-2-guid", title: "Walking Through Ruth", audioUrl: "https://cdn.example.com/audio/ep-2.mp3", audioType: "audio/mpeg", duration: 2853, episodeNumber: 2, image: "https://cdn.example.com/ep-2.png" });
      expect(ruth.pubDate).toBe("2026-09-05T12:00:00.000Z");
      expect(ruth.description).toBe("Donald Clark & Sarah Miller open the book of Ruth.\n\nShow notes at https://grace.example.com/ruth");

      expect(first).toMatchObject({ title: "Welcome to the Podcast", description: "Our very first episode.", duration: 1800, episodeNumber: 1 });
      expect(first.image).toBe("https://cdn.example.com/artwork.png");

      expect(blog).toMatchObject({ audioUrl: "", pubDate: "", duration: 725, episodeNumber: null, guid: "https://grace.example.com/blog/1" });
    });

    it("rejects XML that is not an RSS channel", () => {
      expect(() => PodcastFeedHelper.parse("<feed xmlns=\"http://www.w3.org/2005/Atom\"><title>Atom</title></feed>")).toThrow(PodcastFeedError);
      expect(() => PodcastFeedHelper.parse("<html><body>Not a feed</body></html>")).toThrow("not an RSS podcast feed");
    });
  });

  describe("validateUrl", () => {
    it("accepts public http(s) hosts", async () => {
      expect(await PodcastFeedHelper.validateUrl("https://feeds.example.com/podcast.xml")).toBeNull();
      expect(await PodcastFeedHelper.validateUrl("http://feeds.example.com/podcast.xml")).toBeNull();
    });

    it("rejects non-http schemes, loopback, private and metadata addresses", async () => {
      expect(await PodcastFeedHelper.validateUrl("ftp://feeds.example.com/podcast.xml")).toMatch(/http/);
      expect(await PodcastFeedHelper.validateUrl("not a url")).toBe("Invalid feed URL");
      expect(await PodcastFeedHelper.validateUrl("http://localhost:8084/content/sermons/rss/CHU1")).toBe("Feed URL host is not allowed");
      expect(await PodcastFeedHelper.validateUrl("http://127.0.0.1/feed")).toBe("Feed URL host is not allowed");
      expect(await PodcastFeedHelper.validateUrl("http://10.0.0.5/feed")).toBe("Feed URL host is not allowed");
      expect(await PodcastFeedHelper.validateUrl("http://169.254.169.254/latest/meta-data")).toBe("Feed URL host is not allowed");
      expect(await PodcastFeedHelper.validateUrl("https://db.internal-only.test/feed")).toBe("Feed URL resolves to a private address");
    });
  });

  describe("load", () => {
    it("fetches, parses and caches the feed for repeat requests", async () => {
      mockedGet.mockResolvedValue(okResponse(FEED_XML));
      const first = await PodcastFeedHelper.load("https://feeds.example.com/podcast.xml");
      const second = await PodcastFeedHelper.load("https://feeds.example.com/podcast.xml");
      expect(first.episodes[0].title).toBe("Walking Through Ruth");
      expect(second).toBe(first);
      expect(mockedGet).toHaveBeenCalledTimes(1);
      expect(mockedGet.mock.calls[0][1]).toMatchObject({ timeout: 8000, maxRedirects: 0, responseType: "text" });
    });

    it("refuses to fetch blocked hosts without making a request", async () => {
      await expect(PodcastFeedHelper.load("http://192.168.1.10/feed.xml")).rejects.toMatchObject({ status: 400, message: "Feed URL host is not allowed" });
      expect(mockedGet).not.toHaveBeenCalled();
    });

    it("follows a public redirect but stops at a redirect into a private host", async () => {
      mockedGet
        .mockResolvedValueOnce({ status: 301, data: "", headers: { location: "https://cdn.example.com/podcast.xml" } })
        .mockResolvedValueOnce(okResponse(FEED_XML));
      const feed = await PodcastFeedHelper.load("https://feeds.example.com/podcast.xml");
      expect(feed.title).toBe("Grace Community Podcast");
      expect(mockedGet.mock.calls[1][0]).toBe("https://cdn.example.com/podcast.xml");

      PodcastFeedHelper.clearCache();
      mockedGet.mockReset();
      mockedGet.mockResolvedValueOnce({ status: 302, data: "", headers: { location: "http://169.254.169.254/latest/meta-data" } });
      await expect(PodcastFeedHelper.load("https://feeds.example.com/other.xml")).rejects.toMatchObject({ status: 400 });
      expect(mockedGet).toHaveBeenCalledTimes(1);
    });

    it("reports unreachable feeds as a 502 and unparseable bodies as a 422", async () => {
      mockedGet.mockRejectedValueOnce(new Error("ECONNRESET"));
      await expect(PodcastFeedHelper.load("https://feeds.example.com/down.xml")).rejects.toMatchObject({ status: 502 });
      mockedGet.mockResolvedValueOnce(okResponse("<html><body>oops</body></html>"));
      await expect(PodcastFeedHelper.load("https://feeds.example.com/html.xml")).rejects.toMatchObject({ status: 422 });
    });
  });
});
