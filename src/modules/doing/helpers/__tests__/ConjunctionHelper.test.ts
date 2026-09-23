jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: {} }));
jest.mock("../ConditionHelper.js", () => ({ ConditionHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: {} }));

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
