jest.mock("@churchapps/apihelper", () => ({}));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { youVersionApiKey: "test" } }));
jest.mock("axios", () => ({ get: jest.fn() }));

import axios from "axios";
import { YouVersionHelper } from "../YouVersionHelper.js";

describe("YouVersionHelper.cacheKey", () => {
  it("prefixes a numeric YouVersion id", () => {
    expect(YouVersionHelper.cacheKey("111")).toBe("YOUVERSION-111");
  });

  it("does not double-prefix", () => {
    expect(YouVersionHelper.cacheKey("YOUVERSION-111")).toBe("YOUVERSION-111");
  });
});

describe("YouVersionHelper.parseVersesFromHtml", () => {
  it("extracts verse numbers and text", () => {
    const html = '<span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>In the beginning God created the heavens and the earth.<span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>Now the earth was formless and empty.';
    expect(YouVersionHelper.parseVersesFromHtml(html)).toEqual([
      { verseNumber: 1, text: "In the beginning God created the heavens and the earth." },
      { verseNumber: 2, text: "Now the earth was formless and empty." }
    ]);
  });

  it("keeps a space when HTML tags sit between words", () => {
    const html = '<span class="yv-v" v="105"></span><span class="yv-vlbl">105</span>Your word is a lamp for my feet,<br class="s1"/>a light on my path.';
    expect(YouVersionHelper.parseVersesFromHtml(html)).toEqual([{ verseNumber: 105, text: "Your word is a lamp for my feet, a light on my path." }]);
  });
});

describe("YouVersionHelper.getContent rate-limit breaker", () => {
  const mockGet = (axios as any).get as jest.Mock;

  beforeEach(() => {
    YouVersionHelper.blockedUntil = 0;
    mockGet.mockReset();
  });

  it("blocks upstream calls for retry-after seconds following a 429", async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 429, headers: { "retry-after": "300" }, data: "Rate limit exceeded." }, message: "429" });
    await expect(YouVersionHelper.getContent("http://x")).rejects.toBeTruthy();
    expect(YouVersionHelper.blockedUntil).toBeGreaterThan(Date.now() + 290000);

    await expect(YouVersionHelper.getContent("http://x")).rejects.toMatchObject({ status: 429 });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("resumes after cooldown expires", async () => {
    YouVersionHelper.blockedUntil = Date.now() - 1;
    mockGet.mockResolvedValueOnce({ data: { ok: true } });
    await expect(YouVersionHelper.getContent("http://x")).resolves.toEqual({ ok: true });
  });
});

describe("YouVersionHelper.parseChapterHtml", () => {
  it("stores verses under the YOUVERSION- cache key", () => {
    const html = '<span class="yv-v" v="16"></span><span class="yv-vlbl">16</span>For God so loved the world.';
    const verses = YouVersionHelper.parseChapterHtml(html, "JHN", 3, "111");
    expect(verses).toHaveLength(1);
    expect(verses[0]).toMatchObject({
      translationKey: "YOUVERSION-111",
      verseKey: "JHN.3.16",
      bookKey: "JHN",
      chapterNumber: 3,
      verseNumber: 16,
      content: "For God so loved the world.",
      newParagraph: false
    });
  });
});
