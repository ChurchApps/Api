import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { forms: { admin: "formsAdmin", edit: "formsEdit" } } }));
jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "genQ" } }));

import express from "express";
import { FormController } from "../FormController.js";
import { Form } from "../../models/index.js";
import { QuestionRepo } from "../../repositories/QuestionRepo.js";
import { getDb } from "../../db/index.js";

// Minimal in-memory stand-in for the questions table. Rows are stored exactly as they
// would be on disk, so `choices` is whatever string the repo wrote.
type QuestionRow = Record<string, unknown>;
interface FakeChain {
  selectAll: () => FakeChain;
  where: () => FakeChain;
  orderBy: () => FakeChain;
  execute: () => Promise<QuestionRow[]>;
}

function fakeDb(rows: QuestionRow[]) {
  const chainable = (execute: () => Promise<QuestionRow[]>) => {
    const chain: FakeChain = {
      selectAll: () => chain,
      where: () => chain,
      orderBy: () => chain,
      execute
    };
    return chain;
  };
  return {
    selectFrom: () => chainable(async () => rows.slice()),
    insertInto: () => ({ values: (v: QuestionRow) => ({ execute: async () => { rows.push({ ...v }); } }) })
  };
}

describe("FormController.duplicate choices round-trip (issue 1097)", () => {
  it("copies dropdown answer choices as an array, not a double-encoded string", async () => {
    const choices = ["Under 25", "25-34", "35-44"];
    const rows: QuestionRow[] = [
      {
        id: "q1",
        churchId: "c1",
        formId: "f1",
        parentId: null,
        title: "Age range",
        description: null,
        fieldType: "Select",
        placeholder: null,
        sort: 1,
        required: false,
        choices: JSON.stringify(choices),
        removed: 0
      }
    ];
    (getDb as jest.Mock).mockReturnValue(fakeDb(rows));

    const questionRepo = new QuestionRepo();
    const repos = {
      form: {
        load: jest.fn(async () => ({ id: "f1", churchId: "c1", name: "Connect Card", contentType: "form" })),
        save: jest.fn(async (f: Form) => ({ ...f, id: "f2" }))
      },
      question: questionRepo
    };

    const controller = new FormController();
    const au = { churchId: "c1", id: "u1", personId: "p1", checkAccess: () => true };
    Object.assign(controller, {
      repos,
      actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au),
      json: (obj: unknown, status: number) => ({ obj, status }),
      formAccess: jest.fn(async () => true)
    });

    await controller.duplicate("f1", {} as express.Request<{}, {}, null>, {} as express.Response);

    const copied = rows.find((r) => r.formId === "f2");
    expect(copied).toBeDefined();
    // Read the copy back the same way the public portal endpoint does.
    const model = questionRepo.convertToModel("c1", copied);
    expect(Array.isArray(model.choices)).toBe(true);
    expect(model.choices).toEqual(choices);
  });
});
