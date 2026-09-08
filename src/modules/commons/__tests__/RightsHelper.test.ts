import { RightsHelper, USES } from "../helpers/RightsHelper";

const CREDIT = "Credit the writer and link the license";
const NOT_MONETIZED = "Not monetized: no ads, paid downloads, or ticketed streams";
const NON_COMMERCIAL = "Non-commercial use only";
const SA_ARRANGE = "Share alike: release your arrangement or translation under the same license";
const SA_RECORD = "Share alike: a recording carries the same license";
const NO_DERIVATIVES = "No derivatives: no arrangements, translations, or transposed charts may be distributed";

const allowed = (m: ReturnType<typeof RightsHelper.matrixForLicense>) => Object.fromEntries(USES.map((u) => [u, m[u].allowed]));
const conditions = (m: ReturnType<typeof RightsHelper.matrixForLicense>) => Object.fromEntries(USES.map((u) => [u, m[u].conditions]));

describe("RightsHelper.matrixForLicense — one row of the contract table each", () => {
  it("PD and CC0 allow everything unconditionally", () => {
    for (const id of ["PD", "CC0", "pd"]) {
      const m = RightsHelper.matrixForLicense(id);
      expect(allowed(m)).toEqual({ project: true, print: true, stream: true, arrange: true, record: true });
      expect(conditions(m)).toEqual({ project: [], print: [], stream: [], arrange: [], record: [] });
    }
  });

  it("WC allows everything; stream and record must not be monetized", () => {
    const m = RightsHelper.matrixForLicense("WC");
    expect(allowed(m)).toEqual({ project: true, print: true, stream: true, arrange: true, record: true });
    expect(conditions(m)).toEqual({ project: [], print: [], stream: [NOT_MONETIZED], arrange: [], record: [NOT_MONETIZED] });
  });

  it("CC-BY asks for credit on every use", () => {
    const m = RightsHelper.matrixForLicense("CC-BY");
    expect(allowed(m)).toEqual({ project: true, print: true, stream: true, arrange: true, record: true });
    expect(conditions(m)).toEqual({ project: [CREDIT], print: [CREDIT], stream: [CREDIT], arrange: [CREDIT], record: [CREDIT] });
  });

  it("-SA adds share-alike to arrange and record", () => {
    const m = RightsHelper.matrixForLicense("CC-BY-SA");
    expect(allowed(m)).toEqual({ project: true, print: true, stream: true, arrange: true, record: true });
    expect(conditions(m)).toEqual({ project: [CREDIT], print: [CREDIT], stream: [CREDIT], arrange: [CREDIT, SA_ARRANGE], record: [CREDIT, SA_RECORD] });
  });

  it("-NC adds non-commercial to every use", () => {
    const m = RightsHelper.matrixForLicense("CC-BY-NC");
    expect(allowed(m)).toEqual({ project: true, print: true, stream: true, arrange: true, record: true });
    for (const u of USES) expect(m[u].conditions).toEqual([CREDIT, NON_COMMERCIAL]);
  });

  it("-NC-SA stacks both", () => {
    const m = RightsHelper.matrixForLicense("CC-BY-NC-SA");
    expect(conditions(m)).toEqual({
      project: [CREDIT, NON_COMMERCIAL], print: [CREDIT, NON_COMMERCIAL], stream: [CREDIT, NON_COMMERCIAL],
      arrange: [CREDIT, NON_COMMERCIAL, SA_ARRANGE], record: [CREDIT, NON_COMMERCIAL, SA_RECORD]
    });
  });

  it("-ND forbids arrange, keeps record", () => {
    for (const id of ["CC-BY-ND", "CC-BY-NC-ND"]) {
      const m = RightsHelper.matrixForLicense(id);
      expect(allowed(m)).toEqual({ project: true, print: true, stream: true, arrange: false, record: true });
      expect(m.arrange.conditions).toEqual([NO_DERIVATIVES]);
      expect(m.project.conditions[0]).toBe(CREDIT);
      expect(m.record.conditions.includes(NON_COMMERCIAL)).toBe(id.includes("-NC"));
    }
  });

  it("an unknown id allows nothing", () => {
    for (const id of ["", "ASCAP", "CCLI"]) {
      const m = RightsHelper.matrixForLicense(id);
      expect(allowed(m)).toEqual({ project: false, print: false, stream: false, arrange: false, record: false });
      expect(m.print.conditions).toEqual(["License not recognised"]);
    }
  });
});

describe("RightsHelper.composeMatrix", () => {
  it("a use is allowed only when every layer allows it; conditions are the deduped union", () => {
    const m = RightsHelper.composeMatrix([{ license: "PD" }, { license: "CC-BY-ND" }, null, { license: "CC-BY-SA" }]);
    expect(m.arrange).toEqual({ allowed: false, conditions: [NO_DERIVATIVES, CREDIT, SA_ARRANGE] });
    expect(m.print).toEqual({ allowed: true, conditions: [CREDIT] });
    expect(m.record).toEqual({ allowed: true, conditions: [CREDIT, SA_RECORD] });
  });

  it("falls back to the asset license when no layer is recorded, and to a closed matrix when there is neither", () => {
    expect(RightsHelper.composeMatrix([null, null], "WC").stream.conditions).toEqual([NOT_MONETIZED]);
    expect(RightsHelper.composeMatrix([], "WC").project.allowed).toBe(true);
    expect(RightsHelper.composeMatrix([])).toMatchObject({ project: { allowed: false, conditions: ["No rights recorded"] } });
  });
});

describe("RightsHelper.ccliReport", () => {
  it("is false for every PD / CC0 / WC / CC-BY* package, true for anything else or nothing", () => {
    expect(RightsHelper.ccliReport([{ license: "PD" }, { license: "CC-BY-NC-SA" }, null])).toBe(false);
    expect(RightsHelper.ccliReport([{ license: "CC0" }, { license: "WC" }])).toBe(false);
    expect(RightsHelper.ccliReport([{ license: "PD" }, { license: "ASCAP" }])).toBe(true);
    expect(RightsHelper.ccliReport([], "CC-BY")).toBe(false);
    expect(RightsHelper.ccliReport([], "Unknown")).toBe(true);
    expect(RightsHelper.ccliReport([])).toBe(true);
  });
});

describe("RightsHelper.notice", () => {
  it("prints the one-line notice per license", () => {
    expect(RightsHelper.notice("PD")).toBe("Public domain. Free for every use, including commercial.");
    expect(RightsHelper.notice("WC", "1.0")).toContain("WorshipCommons License 1.0");
    expect(RightsHelper.notice("CC-BY-SA", "4.0")).toBe("Creative Commons BY SA 4.0: credit the writer and link the license.");
    expect(RightsHelper.notice("???")).toBe("License not recognised.");
  });
});
