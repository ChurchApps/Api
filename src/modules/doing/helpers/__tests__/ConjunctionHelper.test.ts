jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: {} }));
jest.mock("../ConditionHelper.js", () => ({ ConditionHelper: { getPeopleIdsMatchingConditions: async (c: any[]) => c } }));
jest.mock("@churchapps/apihelper", () => ({
  ArrayHelper: {
    getOne: (arr: any[], prop: string, value: any) => arr.find((a) => a[prop] === value) || null,
    getAll: (arr: any[], prop: string, value: any) => arr.filter((a) => a[prop] === value)
  }
}));

import { ConjunctionHelper } from "../ConjunctionHelper.js";

const and = (...sets: string[][]) => ({ groupType: "AND", conditions: sets.map((matchingIds) => ({ matchingIds })), conjunctions: [] }) as any;

describe("ConjunctionHelper.getPeopleFromTree AND", () => {
  it("stays empty once an intersection is empty", () => {
    expect(ConjunctionHelper.getPeopleFromTree(and(["p1"], ["p2"], ["p3", "p1"]))).toEqual([]);
  });

  it("treats * as no constraint instead of replacing the intersection", () => {
    expect(ConjunctionHelper.getPeopleFromTree(and(["p1", "p2"], ["*"], ["p2", "p3"]))).toEqual(["p2"]);
    expect(ConjunctionHelper.getPeopleFromTree(and(["*"], ["*"]))).toEqual(["*"]);
  });

  it("does not mutate a condition's own matchingIds", () => {
    const tree = and(["p1", "p2"], ["p2"]);
    ConjunctionHelper.getPeopleFromTree(tree);
    expect(tree.conditions[0].matchingIds).toEqual(["p1", "p2"]);
  });
});

describe("ConjunctionHelper.getPeopleIdsForStepRoute", () => {
  const repos = (conjunctions: any[], conditions: any[]) =>
    ({
      conjunction: { loadForStepRoute: async () => conjunctions },
      condition: { loadForStepRoute: async () => conditions }
    }) as any;

  it("matches everyone when the route has no conditions", async () => {
    expect(await ConjunctionHelper.getPeopleIdsForStepRoute("c1", "r1", repos([], []))).toEqual(["*"]);
    expect(await ConjunctionHelper.personMatchesStepRoute("c1", "r1", "p1", repos([], []))).toBe(true);
  });

  it("matches everyone when the route only has an empty root group", async () => {
    const conjunctions = [{ id: "j1", parentId: "", groupType: "AND" }];
    expect(await ConjunctionHelper.getPeopleIdsForStepRoute("c1", "r1", repos(conjunctions, []))).toEqual(["*"]);
  });

  it("still filters when the route has conditions", async () => {
    const conjunctions = [{ id: "j1", parentId: "", groupType: "AND" }];
    const conditions = [{ id: "d1", conjunctionId: "j1", matchingIds: ["p2"] }];
    expect(await ConjunctionHelper.personMatchesStepRoute("c1", "r1", "p1", repos(conjunctions, conditions))).toBe(false);
    expect(await ConjunctionHelper.personMatchesStepRoute("c1", "r1", "p2", repos(conjunctions, conditions))).toBe(true);
  });
});
