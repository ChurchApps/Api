/** Tests SignPresenter-format signage feed mapping from plan items + a lessons.church venue feed. */

import { FeedVenue, SignageFeedHelper } from "../SignageFeedHelper.js";

const venueFeed: FeedVenue = {
  id: "VEN1",
  name: "Elementary",
  lessonName: "Creation",
  sections: [
    {
      id: "SEC1",
      name: "Countdown",
      actions: [
        { id: "ACT1", actionType: "play", files: [{ name: "Countdown Video", url: "https://content.lessons.church/countdown.mp4", seconds: 300 }] },
        { id: "ACT2", actionType: "say", content: "Welcome everyone" }
      ]
    },
    {
      id: "SEC2",
      name: "Lesson",
      actions: [
        { id: "ACT3", actionType: "play", files: [{ name: "Intro", url: "https://content.lessons.church/intro.mp4", seconds: 120 }] },
        { id: "ACT4", actionType: "play", files: [{ name: "Loop", url: "https://content.lessons.church/loop.mp4", seconds: 90, loop: true }] },
        { id: "ACT5", actionType: "play", files: [{ name: "NoUrl" }] }
      ]
    }
  ]
};

describe("SignageFeedHelper.convertFeedFiles", () => {
  it("maps url/seconds and converts loop to loopVideo with 3600s", () => {
    const files = SignageFeedHelper.convertFeedFiles([
      { name: "a", url: "http://x/a.mp4", seconds: 30 },
      { name: "b", url: "http://x/b.mp4", seconds: 90, loop: true },
      { name: "c", url: "http://x/c.jpg" },
      { name: "skipped" }
    ]);
    expect(files).toEqual([
      { name: "a", url: "http://x/a.mp4", seconds: 30, loopVideo: false },
      { name: "b", url: "http://x/b.mp4", seconds: 3600, loopVideo: true },
      { name: "c", url: "http://x/c.jpg", seconds: 3600, loopVideo: false }
    ]);
  });
});

describe("SignageFeedHelper.buildMessages", () => {
  it("resolves a childless lessonSection to all play files in that section", () => {
    const tree = [
      {
        id: "PI1",
        itemType: "header",
        label: "Lesson Playback",
        children: [{ id: "PI2", itemType: "lessonSection", relatedId: "SEC2", label: "Section 1", children: [] }]
      }
    ];
    const messages = SignageFeedHelper.buildMessages(tree, venueFeed);
    expect(messages).toEqual([
      {
        name: "Section 1",
        files: [
          { name: "Intro", url: "https://content.lessons.church/intro.mp4", seconds: 120, loopVideo: false },
          { name: "Loop", url: "https://content.lessons.church/loop.mp4", seconds: 3600, loopVideo: true }
        ]
      }
    ]);
  });

  it("uses only the customized action children when a section has children", () => {
    const tree = [
      {
        id: "PI1",
        itemType: "section",
        relatedId: "SEC2",
        label: "Lesson",
        children: [{ id: "PI2", itemType: "action", relatedId: "ACT4", label: "Loop", children: [] }]
      }
    ];
    const messages = SignageFeedHelper.buildMessages(tree, venueFeed);
    expect(messages.length).toBe(1);
    expect(messages[0].files.map((f) => f.name)).toEqual(["Loop"]);
  });

  it("skips songs and plain items but includes providerFile links", () => {
    const tree = [
      {
        id: "PI1",
        itemType: "header",
        label: "Worship",
        children: [
          { id: "PI2", itemType: "arrangementKey", relatedId: "ARK1", label: "Song", children: [] },
          { id: "PI3", itemType: "item", label: "Announcements", link: "https://example.com/notes", children: [] },
          { id: "PI4", itemType: "providerFile", label: "Slide", link: "https://cdn.example.com/slide.jpg", seconds: 15, children: [] }
        ]
      }
    ];
    const messages = SignageFeedHelper.buildMessages(tree, venueFeed);
    expect(messages).toEqual([{ name: "Slide", files: [{ name: "Slide", url: "https://cdn.example.com/slide.jpg", seconds: 15, loopVideo: false }] }]);
  });

  it("plays every customized lesson section plus an added external item, in plan order", () => {
    const tree = [
      {
        id: "PI1",
        itemType: "header",
        label: "Lesson",
        providerId: "lessonschurch",
        providerPath: "/lessons/P/S/L/VEN1",
        children: [
          { id: "PI2", itemType: "providerSection", relatedId: "SEC1", label: "Countdown", children: [] },
          { id: "PI3", itemType: "providerSection", relatedId: "SEC2", label: "Lesson", children: [] }
        ]
      },
      { id: "PI4", itemType: "providerFile", label: "Alive.mp4", link: "https://dl.dropbox.com/alive.mp4", seconds: 200, children: [] }
    ];
    const messages = SignageFeedHelper.buildMessages(tree, venueFeed);
    expect(messages.map((m) => m.name)).toEqual(["Countdown", "Lesson", "Alive.mp4"]);
    expect(messages[1].files.map((f) => f.name)).toEqual(["Intro", "Loop"]);
  });

  it("returns no messages when nothing is playable", () => {
    const tree = [{ id: "PI1", itemType: "header", label: "Notes", children: [{ id: "PI2", itemType: "item", label: "Talk", children: [] }] }];
    expect(SignageFeedHelper.buildMessages(tree, venueFeed)).toEqual([]);
  });
});

describe("SignageFeedHelper.buildDefaultMessages", () => {
  it("emits one message per section with playable files", () => {
    const messages = SignageFeedHelper.buildDefaultMessages(venueFeed);
    expect(messages.map((m) => m.name)).toEqual(["Countdown", "Lesson"]);
    expect(messages[0].files).toEqual([{ name: "Countdown Video", url: "https://content.lessons.church/countdown.mp4", seconds: 300, loopVideo: false }]);
  });

  it("returns empty for a null feed", () => {
    expect(SignageFeedHelper.buildDefaultMessages(null)).toEqual([]);
  });
});

describe("SignageFeedHelper.getVenueId", () => {
  it("prefers a lessonschurch plan item providerPath over plan contentId", () => {
    const plan = { contentId: "VENPLAN" };
    const items = [{ id: "PI1", providerId: "lessonschurch", providerPath: "VENITEM" }];
    expect(SignageFeedHelper.getVenueId(plan, items)).toBe("VENITEM");
  });

  it("takes the venue id from the end of a customized lesson providerPath", () => {
    const items = [{ id: "PI1", providerId: "lessonschurch", providerPath: "/lessons/P/S/L/VEN1" }];
    expect(SignageFeedHelper.getVenueId({ contentId: "VENPLAN" }, items)).toBe("VEN1");
  });

  it("falls back to plan contentId when the providerPath has no venue segment", () => {
    const items = [{ id: "PI1", providerId: "lessonschurch", providerPath: "/" }];
    expect(SignageFeedHelper.getVenueId({ contentId: "VENPLAN" }, items)).toBe("VENPLAN");
  });

  it("falls back to plan contentId when no provider items exist", () => {
    expect(SignageFeedHelper.getVenueId({ contentId: "VENPLAN" }, [])).toBe("VENPLAN");
  });

  it("returns null for non-lessons providers", () => {
    expect(SignageFeedHelper.getVenueId({ providerId: "gocurriculum", contentId: "X" }, [])).toBeNull();
    expect(SignageFeedHelper.getVenueId({ contentId: "X" }, [{ id: "PI1", providerId: "gocurriculum", providerPath: "Y" }])).toBeNull();
  });
});

describe("SignageFeedHelper.buildPlanFeed", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keeps the lesson in the feed after the plan is customized", async () => {
    const fetchSpy = jest.spyOn(SignageFeedHelper, "fetchVenueFeed").mockImplementation(async (venueId: string) => (venueId === "VEN1" ? venueFeed : null));
    const plan = { providerId: "lessonschurch", contentId: "VEN1" };
    const planItems = [
      { id: "PI1", parentId: null, itemType: "header", label: "Lesson", providerId: "lessonschurch", providerPath: "/lessons/P/S/L/VEN1" },
      { id: "PI2", parentId: "PI1", itemType: "providerSection", relatedId: "SEC1", label: "Countdown", providerId: "lessonschurch", providerPath: "/lessons/P/S/L/VEN1" },
      { id: "PI3", parentId: "PI1", itemType: "providerSection", relatedId: "SEC2", label: "Lesson", providerId: "lessonschurch", providerPath: "/lessons/P/S/L/VEN1" },
      { id: "PI4", parentId: null, itemType: "providerFile", label: "Alive.mp4", link: "https://dl.dropbox.com/alive.mp4", seconds: 200 }
    ];
    const { messages } = await SignageFeedHelper.buildPlanFeed(plan, planItems);
    expect(fetchSpy).toHaveBeenCalledWith("VEN1");
    expect(messages.map((m) => m.name)).toEqual(["Countdown", "Lesson", "Alive.mp4"]);
  });
});
