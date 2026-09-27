import "reflect-metadata";

jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen" } }));

import { QuestionRepo } from "../QuestionRepo.js";

// Issue 1135: forms copied before the #1097 duplicate fix stored choices JSON-encoded twice.
// One JSON.parse returned a string, and Forms > Submissions crashed calling forEach on it.
describe("QuestionRepo choices (issue 1135)", () => {
  const repo = new QuestionRepo();
  const choices = [{ value: "Yes", text: "Yes" }, { value: "No", text: "No" }];
  const row = (raw: any) => ({ id: "q1", churchId: "c1", formId: "f1", fieldType: "Multiple Choice", choices: raw });

  it("parses normally encoded choices", () => {
    expect(repo.convertToModel("c1", row(JSON.stringify(choices)))?.choices).toEqual(choices);
  });

  it("unwraps choices that were JSON-encoded twice", () => {
    expect(repo.convertToModel("c1", row(JSON.stringify(JSON.stringify(choices))))?.choices).toEqual(choices);
  });

  it("returns an empty array for raw text or non-array JSON", () => {
    expect(repo.convertToModel("c1", row("Yes,No"))?.choices).toEqual([]);
    expect(repo.convertToModel("c1", row(JSON.stringify("Yes,No")))?.choices).toEqual([]);
    expect(repo.convertToModel("c1", row(JSON.stringify({ a: 1 })))?.choices).toEqual([]);
  });

  it("leaves missing choices unset so Yes/No questions keep their defaults", () => {
    expect(repo.convertToModel("c1", row(null))?.choices).toBeNull();
    expect(repo.convertToModel("c1", row("null"))?.choices).toBeNull();
  });
});
