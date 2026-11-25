/** A lesson trim saved from one customized plan is re-applied to every lesson scheduled into the plan type (#1401). */

jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: {} }));
const getInstructionsMock = jest.fn();
jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: (): void => undefined,
  getProviderConfig: (): null => null,
  TokenHelper: class { isTokenExpired() { return false; } },
  getProvider: (id: string) => (id === "gocurriculum" ? { requiresAuth: true, getInstructions: getInstructionsMock } : null)
}));

const loadGroupLeaderPersonIdsMock = jest.fn().mockResolvedValue(["LEADER1"]);
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadGroupLeaderPersonIds: loadGroupLeaderPersonIdsMock,
    loadChurch: async () => ({ subDomain: "grace" })
  })
}));

const notifyMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: notifyMock } }));

import { LessonTrimHelper, LessonTrim } from "../LessonTrimHelper.js";
import { ProviderAuthHelper } from "../ProviderAuthHelper.js";
import type { LessonTrimKeep } from "../LessonTrimHelper.js";
import type { ContentProviderAuthData, InstructionItem } from "@churchapps/content-providers";
import type { Plan, PlanItem } from "../../models/index.js";
import type { Repos } from "../../repositories/Repos.js";

// In-memory fakes return partial rows, so each repo method may resolve to a partial of what the real one returns.
type Loose<R> = R extends (infer E)[] ? Partial<E>[] : R extends object ? Partial<R> : R;
type FakeRepo<T> = { [K in keyof T]?: T[K] extends (...args: infer A) => Promise<infer R> ? (...args: A) => Promise<Loose<R>> : T[K] };
type FakeRepos = { [K in keyof Repos]?: FakeRepo<Repos[K]> };

const file = (label: string, url?: string) => ({ itemType: "file", label, downloadUrl: url, mediaType: "video" as const });
const action = (label: string, files: InstructionItem[] = []) => ({ itemType: "action", actionType: "say", label, children: files.length ? files : undefined });

// Shaped like GoCurriculumProvider.guideToInstructions: sections → actions (spoken script) → files (playlist titles).
function goLesson(verse: string, opts: { questions?: string; journey?: boolean; journeyMedia?: boolean } = {}) {
  const items: InstructionItem[] = [
    {
      id: "lg-0",
      itemType: "section",
      label: "Opening",
      children: [
        action("Play the countdown", [file("Countdown", "https://go.example.com/countdown.mp4")]),
        action("Welcome everyone and introduce the series", [file("Series Intro", "https://go.example.com/intro.mp4")]),
        action("Let's learn our memory verse together", [file(verse, "https://go.example.com/verse.mp4")])
      ]
    },
    { id: "lg-1", itemType: "section", label: "The Fab Five Intro", children: [action("Read this aloud")] }
  ];
  if (opts.journey !== false) items.push({ id: "lg-2", itemType: "section", label: "Journey Today Show", children: [action("Watch", [file("Journey Today", opts.journeyMedia === false ? undefined : "https://go.example.com/journey.mp4")])] });
  items.push({ id: "lg-3", itemType: "section", label: opts.questions || "Big Bible Story Questions", children: [action("Show the questions", [file("Questions", "https://go.example.com/q.png")])] });
  items.push({ id: "lg-4", itemType: "section", label: "Giving God the Glory", children: [action("Pray together")] });
  return { name: "Lesson", items };
}

const plan = (id: string, path: string, extra: Partial<Plan> = {}): Plan => ({ id, churchId: "CHU1", ministryId: "MIN1", planTypeId: "PT1", name: id, serviceDate: new Date("2026-11-08"), providerId: "gocurriculum", providerPlanId: path, ...extra });

// Rows a hand customization leaves after deleting the read-aloud sections and expanding Opening down to the memory verse.
const savedRows: PlanItem[] = [
  { id: "H", itemType: "header", label: "Lesson" },
  { id: "R1", parentId: "H", itemType: "providerSection", label: "Opening", providerId: "gocurriculum", providerPath: "/el/s/nov1", providerContentPath: "0" },
  { id: "R2", parentId: "H", itemType: "providerPresentation", label: "Let's learn our memory verse together", providerId: "gocurriculum", providerPath: "/el/s/nov1", providerContentPath: "0.2" },
  { id: "R3", parentId: "H", itemType: "providerSection", label: "Journey Today Show", providerId: "gocurriculum", providerPath: "/el/s/nov1", providerContentPath: "2" },
  { id: "R4", parentId: "H", itemType: "providerSection", label: "Big Bible Story Questions", providerId: "gocurriculum", providerPath: "/el/s/nov1", providerContentPath: "3" },
  { id: "R5", parentId: "H", itemType: "arrangementKey", label: "Worship song" },
  { id: "R6", parentId: "H", itemType: "item", label: "Welcome" }
];

const trimOf = (keep: LessonTrimKeep[]): LessonTrim => ({ providerId: "gocurriculum", savedFromPlanId: "P1", savedFromName: "Nov 1", savedFromDate: "2026-11-01", keep });
const sectionKeeps = [
  { section: "Journey Today Show", sectionIndex: "2" },
  { section: "Big Bible Story Questions", sectionIndex: "3" }
];
const verseKeep = { section: "Opening", sectionIndex: "0", part: "James 1 17a", partPath: "2", itemType: "providerPresentation" };

const labels = (rows: PlanItem[]): string[] => rows.flatMap((r) => [r.label, ...labels(r.children || [])]);

describe("LessonTrimHelper.capture", () => {
  it("keeps only provider rows, with names from the lesson and the memory verse by position", () => {
    const trim = LessonTrimHelper.capture(savedRows, plan("P1", "/el/s/nov1", { name: "Nov 1" }), goLesson("James 1 17a"));
    expect(trim.providerId).toBe("gocurriculum");
    expect(trim.savedFromPlanId).toBe("P1");
    expect(trim.keep).toEqual([
      { section: "Opening", sectionIndex: "0", media: true },
      { section: "Journey Today Show", sectionIndex: "2", media: true },
      { section: "Big Bible Story Questions", sectionIndex: "3", media: true }
    ]);
  });

  it("records a part when its section was not kept whole", () => {
    const rows = savedRows.filter((r) => r.id !== "R1");
    const trim = LessonTrimHelper.capture(rows, plan("P1", "/el/s/nov1"), goLesson("James 1 17a"));
    expect(trim.keep[0]).toEqual({ ...verseKeep, media: true });
  });

  it("falls back to section row labels when the lesson can't be read", () => {
    const trim = LessonTrimHelper.capture(savedRows, plan("P1", "/el/s/nov1"), null);
    expect(trim.keep.map((k) => k.section)).toEqual(["Opening", "Journey Today Show", "Big Bible Story Questions"]);
  });
});

describe("LessonTrimHelper.select", () => {
  it("keeps matching sections in lesson order under one lesson header, with relatedId set", () => {
    const result = LessonTrimHelper.select(goLesson("Matthew 5 10"), trimOf([{ section: "Opening", sectionIndex: "0" }, ...sectionKeeps]), "gocurriculum", "/el/s/nov8");
    expect(result.misses).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].itemType).toBe("header");
    expect(result.rows[0].children!.map((r) => [r.itemType, r.label, r.providerContentPath, r.relatedId])).toEqual([
      ["providerSection", "Opening", "0", "lg-0"],
      ["providerSection", "Journey Today Show", "2", "lg-2"],
      ["providerSection", "Big Bible Story Questions", "3", "lg-3"]
    ]);
    expect(result.rows[0].children!.every((r) => r.providerPath === "/el/s/nov8" && !r.children)).toBe(true);
  });

  it("matches a renamed section that contains the saved name", () => {
    const result = LessonTrimHelper.select(goLesson("John 3 16", { questions: "Bible Story Questions" }), trimOf(sectionKeeps), "gocurriculum", "/el/s/nov29");
    expect(labels(result.rows)).toContain("Bible Story Questions");
    expect(result.misses).toEqual([]);
  });

  it("keeps a renamed memory verse by its position and says so", () => {
    const result = LessonTrimHelper.select(goLesson("Matthew 5 10"), trimOf([verseKeep]), "gocurriculum", "/el/s/nov8");
    const row = result.rows[0].children![0];
    expect(row.itemType).toBe("providerPresentation");
    expect(row.providerContentPath).toBe("0.2");
    expect(result.notes).toEqual(["Kept \"Matthew 5 10\" by position in \"Opening\"; last time it was \"James 1 17a\""]);
  });

  it("matches a part by its file name before falling back to position", () => {
    const result = LessonTrimHelper.select(goLesson("James 1 17a"), trimOf([verseKeep]), "gocurriculum", "/el/s/nov1");
    expect(result.rows[0].children![0].providerContentPath).toBe("0.2");
    expect(result.notes).toEqual([]);
  });

  it("reports a missing section and a section with no media, and trims to the rest", () => {
    const missing = LessonTrimHelper.select(goLesson("x", { journey: false }), trimOf(sectionKeeps.map((k) => ({ ...k, media: true }))), "gocurriculum", "/p");
    expect(labels(missing.rows)).toEqual(["Lesson", "Big Bible Story Questions"]);
    expect(missing.misses).toEqual(["\"Journey Today Show\" isn't in this lesson"]);

    const noMedia = LessonTrimHelper.select(goLesson("x", { journeyMedia: false }), trimOf(sectionKeeps.map((k) => ({ ...k, media: true }))), "gocurriculum", "/p");
    expect(noMedia.misses).toEqual(["\"Journey Today Show\" has no video or image this week"]);
  });

  it("reports a part whose position is gone", () => {
    const lesson = goLesson("x");
    lesson.items[0].children = lesson.items[0].children.slice(0, 1);
    const result = LessonTrimHelper.select(lesson, trimOf([verseKeep]), "gocurriculum", "/p");
    expect(result.rows).toEqual([]);
    expect(result.misses).toEqual(["Nothing in this lesson matched the saved trim"]);
  });

  it("never matches spoken-script labels", () => {
    const result = LessonTrimHelper.select(goLesson("x"), trimOf([{ section: "Read this aloud", sectionIndex: "1" }]), "gocurriculum", "/p");
    expect(result.rows).toEqual([]);
  });

  it("works on a flat one-section lesson", () => {
    const flat = { name: "Folder", items: [{ id: "s", itemType: "section", label: "Folder", children: [action("a.mp4", [file("a.mp4", "https://x/a.mp4")])] }] };
    const result = LessonTrimHelper.select(flat, trimOf([{ section: "Folder", sectionIndex: "0" }]), "gocurriculum", "/f");
    expect(labels(result.rows)).toEqual(["Folder", "Folder"]);
  });
});

describe("LessonTrimHelper.apply", () => {
  let saved: PlanItem[];
  let warnings: Record<string, string | null>;
  const trimJson = JSON.stringify(trimOf([{ section: "Opening", sectionIndex: "0", media: true }, ...sectionKeeps.map((k) => ({ ...k, media: true }))]));
  const makeRepos = (existing: PlanItem[] = [], lessonTrim: string | null = trimJson): Repos => {
    const repos: FakeRepos = {
      planType: { load: async () => ({ id: "PT1", lessonTrim }) },
      planItem: {
        loadForPlan: async () => existing,
        deleteByPlanId: jest.fn(async () => { existing.length = 0; }),
        save: jest.fn(async (row: PlanItem) => { const s = { ...row, id: "N" + saved.length }; saved.push(s); return s; })
      },
      planItemTime: { deleteByPlanId: jest.fn(async (): Promise<void> => undefined) },
      plan: { updateLessonTrimWarning: jest.fn(async (_c: string, id: string, w: string | null) => { warnings[id] = w; }) }
    };
    return repos as Repos;
  };

  beforeEach(() => {
    saved = [];
    warnings = {};
    notifyMock.mockClear();
    jest.spyOn(ProviderAuthHelper, "getAuth").mockResolvedValue({ access_token: "t" } as ContentProviderAuthData);
  });

  it("trims a newly scheduled lesson with no warning", async () => {
    getInstructionsMock.mockResolvedValueOnce(goLesson("Matthew 5 10"));
    const result = await LessonTrimHelper.apply(makeRepos(), "CHU1", plan("P2", "/el/s/nov8"));
    expect(result?.warning).toBeNull();
    expect(saved.map((r) => r.label)).toEqual(["Lesson", "Opening", "Journey Today Show", "Big Bible Story Questions"]);
    expect(saved[1]).toMatchObject({ planId: "P2", parentId: "N0", sort: 1, churchId: "CHU1" });
    expect(warnings.P2).toBeNull();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("stores a miss on the plan and tells the ministry's leaders", async () => {
    getInstructionsMock.mockResolvedValueOnce(goLesson("x", { journey: false }));
    const result = await LessonTrimHelper.apply(makeRepos(), "CHU1", plan("P2", "/el/s/nov8"));
    expect(result?.warning).toBe("\"Journey Today Show\" isn't in this lesson");
    expect(warnings.P2).toBe("\"Journey Today Show\" isn't in this lesson");
    expect(notifyMock).toHaveBeenCalledWith(["LEADER1"], "CHU1", "plan", "P2", expect.stringContaining("Journey Today Show"), expect.any(String));
  });

  it("leaves the lesson whole when nothing matches", async () => {
    getInstructionsMock.mockResolvedValueOnce({ name: "Other", items: [{ itemType: "section", label: "Something else", children: [] }] });
    const result = await LessonTrimHelper.apply(makeRepos(), "CHU1", plan("P2", "/el/s/nov8"));
    expect(saved).toEqual([]);
    expect(result?.warning).toBe("Nothing in this lesson matched the saved trim");
  });

  it("records a warning when the lesson can't be read", async () => {
    getInstructionsMock.mockRejectedValueOnce(new Error("feed down"));
    const result = await LessonTrimHelper.apply(makeRepos(), "CHU1", plan("P2", "/el/s/nov8"));
    expect(saved).toEqual([]);
    expect(result?.warning).toBe("Couldn't read the lesson to apply the saved trim");
  });

  it("does not touch a plan that already has an order of service unless forced", async () => {
    const existing = [{ id: "X", itemType: "item", label: "Hand-made" }];
    getInstructionsMock.mockResolvedValue(goLesson("x"));
    expect(await LessonTrimHelper.apply(makeRepos(existing), "CHU1", plan("P2", "/p"))).toBeNull();
    expect(saved).toEqual([]);

    const repos = makeRepos(existing);
    await LessonTrimHelper.apply(repos, "CHU1", plan("P2", "/p"), { force: true });
    expect(repos.planItem.deleteByPlanId).toHaveBeenCalled();
    expect(saved).toHaveLength(4);
    getInstructionsMock.mockReset();
  });

  it("does nothing for another provider or a plan type without a trim", async () => {
    expect(await LessonTrimHelper.apply(makeRepos(), "CHU1", plan("P2", "/p", { providerId: "lessonschurch" }))).toBeNull();
    expect(await LessonTrimHelper.apply(makeRepos([], null), "CHU1", plan("P2", "/p"))).toBeNull();
    expect(await LessonTrimHelper.apply(makeRepos(), "CHU1", plan("P2", "", { providerPlanId: null }))).toBeNull();
    expect(getInstructionsMock).not.toHaveBeenCalled();
  });
});
