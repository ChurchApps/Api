jest.mock("youtube-captions-scraper", () => ({ getSubtitles: jest.fn() }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { youTubeApiKey: "test" } }));
jest.mock("axios", () => ({ get: jest.fn() }));

import axios from "axios";
import { YouTubeHelper } from "../YouTubeHelper.js";

describe("YouTubeHelper.getVideoPage", () => {
  const mockGet = (axios as any).get as jest.Mock;

  beforeEach(() => mockGet.mockReset());

  it("decodes HTML entities the search feed puts in titles and descriptions", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: { videoId: "abc123" },
            snippet: {
              title: "Plan Your Sunday &amp; More",
              description: "Pastor&#39;s &quot;Q&amp;A&quot; &lt;live&gt; &#x2014; &amp;amp;",
              publishedAt: "2026-10-01T00:00:00Z",
              thumbnails: {}
            }
          }
        ]
      }
    });
    const result = await YouTubeHelper.getVideoPage("CHU00000001", "UC123", "");
    expect(result.sermons[0].title).toBe("Plan Your Sunday & More");
    expect(result.sermons[0].description).toBe("Pastor's \"Q&A\" <live> — &amp;");
  });
});
