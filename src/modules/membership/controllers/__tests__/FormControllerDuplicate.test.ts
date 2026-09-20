import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { forms: { admin: "formsAdmin", edit: "formsEdit" } } }));
jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "genQ" } }));

import { FormController } from "../FormController.js";
import { QuestionRepo } from "../../repositories/QuestionRepo.js";
import { getDb } from "../../db/index.js";

// Minimal in-memory stand-in for the questions table. Rows are stored exactly as they
// would be on disk, so `choices` is whatever string the repo wrote.
function fakeDb(rows: any[]) {
  const chainable = (execute: () => any) => {
    const chain: any = {
      selectAll: () => chain,
      where: () => chain,
      orderBy: () => chain,
      execute
    };
    return chain;
  };
  return {
    selectFrom: () => chainable(async () => rows.slice()),
    insertInto: () => ({ values: (v: any) => ({ execute: async () => { rows.push({ ...v }); } }) })
  };
}

describe("FormController.duplicate choices round-trip (issue 1097)", () => {
  it("copies dropdown answer choices as an array, not a double-encoded string", async () => {
    const choices = ["Under 25", "25-34", "35-44"];
    const rows: any[] = [
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
    const repos: any = {
      form: {
        load: jest.fn(async () => ({ id: "f1", churchId: "c1", name: "Connect Card", contentType: "form" })),
        save: jest.fn(async (f: any) => ({ ...f, id: "f2" }))
      },
      question: questionRepo
    };

    const controller = new FormController();
    (controller as any).repos = repos;
    (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", id: "u1", personId: "p1", checkAccess: () => true });
    (controller as any).json = (obj: any, status: number) => ({ obj, status });
    (controller as any).formAccess = jest.fn(async () => true);

    await (controller as any).duplicate("f1", {}, {});

    const copied = rows.find((r) => r.formId === "f2");
    expect(copied).toBeDefined();
    // Read the copy back the same way the public portal endpoint does.
    const model = questionRepo.convertToModel("c1", copied);
    expect(Array.isArray(model.choices)).toBe(true);
    expect(model.choices).toEqual(choices);
  });
});
