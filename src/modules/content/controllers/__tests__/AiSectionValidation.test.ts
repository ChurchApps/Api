// Validated against the current workspace-built element catalog (see jest moduleNameMapper),
// which is the same contract ElementController.validateAnswers enforces on POST /content/elements.
// Guards that AI-generated sections using the newer element catalog (iconFeature, gallery,
// testimonial, socialIcons, countdown, stats and the sermons layouts) persist without a 400.
import { validateElementAnswers, ElementTypes } from "@current-element-catalog";

interface GenElement {
  elementType: string;
  sort: number;
  answersJSON: string;
  elements?: GenElement[];
}

const collect = (elements: GenElement[], acc: GenElement[] = []): GenElement[] => {
  elements.forEach((e) => {
    acc.push(e);
    if (e.elements) collect(e.elements, acc);
  });
  return acc;
};

const validateSection = (elements: GenElement[]): string[] => {
  const errors: string[] = [];
  collect(elements).forEach((el, i) => {
    let answers: unknown;
    try {
      answers = JSON.parse(el.answersJSON);
    } catch {
      errors.push(`elements[${i}]: answersJSON is not valid JSON`);
      return;
    }
    validateElementAnswers(el.elementType, answers).forEach((e) => errors.push(`elements[${i}]: ${e}`));
  });
  return errors;
};

// A representative "What to Expect" section as the section generator now emits it.
const whatToExpectSection: GenElement[] = [
  { elementType: "text", sort: 0, answersJSON: JSON.stringify({ text: "<h2>What to Expect on Sunday</h2><p>Here is everything you need to feel at home.</p>", textAlignment: "center" }) },
  {
    elementType: "row",
    sort: 1,
    answersJSON: JSON.stringify({ columns: "4,4,4" }),
    elements: [
      { elementType: "iconFeature", sort: 0, answersJSON: JSON.stringify({ icon: "local_cafe", title: "Come As You Are", description: "<p>Grab a free coffee and relax.</p>", iconColor: "#2c5aa0", iconSize: "large", textAlignment: "center" }) },
      { elementType: "iconFeature", sort: 1, answersJSON: JSON.stringify({ icon: "music_note", title: "Engaging Worship", description: "<p>Contemporary music and practical teaching.</p>", iconColor: "#2c5aa0", iconSize: "large", textAlignment: "center" }) },
      { elementType: "iconFeature", sort: 2, answersJSON: JSON.stringify({ icon: "child_care", title: "Kids Are Welcome", description: "<p>Safe, fun programs during every service.</p>", iconColor: "#2c5aa0", iconSize: "large", textAlignment: "center" }) }
    ]
  },
  { elementType: "stats", sort: 2, answersJSON: JSON.stringify({ items: [{ value: 500, suffix: "+", label: "People Every Sunday" }, { value: 35, label: "Small Groups" }, { value: 1985, label: "Serving Since" }], columns: 3 }) },
  { elementType: "testimonial", sort: 3, answersJSON: JSON.stringify({ quotes: [{ text: "We walked in as strangers and left feeling like family.", author: "The Martinez Family", role: "Members since 2023" }], displayMode: "single" }) },
  { elementType: "gallery", sort: 4, answersJSON: JSON.stringify({ photos: [{ url: "https://images.unsplash.com/photo-1507692049790-de58290a4334?w=600&h=600&fit=crop", alt: "Worship" }], layout: "grid", columns: 3, spacing: "medium" }) },
  { elementType: "countdown", sort: 5, answersJSON: JSON.stringify({ mode: "weekly", dayOfWeek: 0, time: "10:00", title: "Next Service Starts In", completedText: "We're live!", showDays: "true", showHours: "true" }) },
  { elementType: "socialIcons", sort: 6, answersJSON: JSON.stringify({ facebook: "https://facebook.com/grace", instagram: "https://instagram.com/grace", iconStyle: "filled", size: "medium", alignment: "center", color: "#2c5aa0" }) },
  { elementType: "sermons", sort: 7, answersJSON: JSON.stringify({ layout: "grid", itemCount: 6, showTitles: "true", showDates: "true" }) }
];

describe("AI-generated section validation (current element catalog)", () => {
  it("the new Tier-1 element types exist in the catalog the generator targets", () => {
    ["iconFeature", "gallery", "testimonial", "socialIcons", "countdown", "stats"].forEach((t) => {
      expect(ElementTypes[t]).toBeDefined();
    });
    expect(ElementTypes.sermons.answersSchema.properties.layout.enum).toEqual(["browse", "grid", "list", "featuredLatest"]);
  });

  it("accepts a representative section that uses the new element types", () => {
    expect(validateSection(whatToExpectSection)).toEqual([]);
  });

  it("accepts each new element type individually with well-formed answers", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["iconFeature", { icon: "groups", title: "Community", description: "<p>...</p>", iconSize: "medium", textAlignment: "center" }],
      ["gallery", { photos: [{ url: "https://x/y.jpg", alt: "a" }], layout: "masonry", columns: 4, spacing: "large" }],
      ["testimonial", { quotes: [{ text: "Great", author: "Sam" }], displayMode: "rotate" }],
      ["socialIcons", { youtube: "https://youtube.com/@x", iconStyle: "outlined", size: "small", alignment: "left", color: "#111111" }],
      ["countdown", { mode: "date", targetDate: "2026-12-25T10:00:00Z", title: "Christmas", showDays: "true", showHours: "false" }],
      ["stats", { items: [{ value: 12, label: "Years" }], columns: 2 }],
      ["sermons", { layout: "featuredLatest", playlistId: "PL1", showTitles: "true", showDates: "true" }]
    ];
    cases.forEach(([type, answers]) => {
      expect({ type, errors: validateElementAnswers(type, answers) }).toEqual({ type, errors: [] });
    });
  });

  it("row column count matches its child element count (nesting rule)", () => {
    const row = whatToExpectSection.find((e) => e.elementType === "row")!;
    const cols = JSON.parse(row.answersJSON).columns.split(",").length;
    expect(row.elements?.length).toBe(cols);
  });

  it("text elements are non-degenerate (non-empty)", () => {
    collect(whatToExpectSection)
      .filter((e) => e.elementType === "text")
      .forEach((e) => {
        const text = JSON.parse(e.answersJSON).text as string;
        expect(text.replace(/<[^>]*>/g, "").trim().length).toBeGreaterThan(0);
      });
  });

  it("still rejects a type-level schema violation on a known element", () => {
    // textAlignment is schema-typed as a string; a number must be flagged.
    expect(validateElementAnswers("text", { textAlignment: 5 }).length).toBeGreaterThan(0);
  });

  it("rejects a malformed answer on a new element type (stats.items must be an array)", () => {
    expect(validateElementAnswers("stats", { items: "not-an-array", columns: 3 }).length).toBeGreaterThan(0);
  });
});
