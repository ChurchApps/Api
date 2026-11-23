import "reflect-metadata";

jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen" } }));

import { QuestionRepo } from "../QuestionRepo.js";
import { getDb } from "../../db/index.js";

describe("QuestionRepo showIf", () => {
  const repo = new QuestionRepo();
  const row = (raw: any) => ({ id: "q2", churchId: "c1", formId: "f1", fieldType: "Textbox", showIf: raw });

  it("parses a stored condition", () => {
    expect(repo.convertToModel("c1", row(JSON.stringify({ questionId: "q1", value: "Yes" })))?.showIf).toEqual({ questionId: "q1", value: "Yes" });
  });

  it("returns null for no condition, malformed JSON or a condition without a question", () => {
    expect(repo.convertToModel("c1", row(null))?.showIf).toBeNull();
    expect(repo.convertToModel("c1", row("{bad"))?.showIf).toBeNull();
    expect(repo.convertToModel("c1", row(JSON.stringify({ value: "Yes" })))?.showIf).toBeNull();
  });

  it("stores a condition as JSON and clears it when no question is picked", async () => {
    const values: any[] = [];
    (getDb as jest.Mock).mockReturnValue({ insertInto: () => ({ values: (v: any) => ({ execute: async () => { values.push(v); } }) }) });
    await repo.save({ churchId: "c1", formId: "f1", title: "Guests", showIf: { questionId: "q1" } });
    await repo.save({ churchId: "c1", formId: "f1", title: "Notes", showIf: { questionId: "", value: "x" } });
    expect(JSON.parse(values[0].showIf)).toEqual({ questionId: "q1", value: "" });
    expect(values[1].showIf).toBeNull();
  });
});
