import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../models/index", () => ({}));

import { QuestionController } from "../QuestionController.js";

function questionController() {
  const repos: any = {
    question: {
      load: jest.fn(async () => ({ id: "q2", formId: "f1", sort: 2 })),
      moveQuestionUp: jest.fn(async () => undefined),
      moveQuestionDown: jest.fn(async () => undefined)
    }
  };
  const au = { churchId: "c1", id: "u1" };
  const controller = new QuestionController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).formAccess = jest.fn(async () => true);
  return { controller, repos };
}

// Issue 1254: the sort routes returned undefined, so inversify never sent a response and
// each reorder hung until it timed out ("Something went wrong" about a minute later).
describe("QuestionController sort routes (issue 1254)", () => {
  it("responds after moving a question up", async () => {
    const { controller, repos } = questionController();
    const result = await (controller as any).moveQuestionUp("q2", {}, {});
    expect(repos.question.moveQuestionUp).toHaveBeenCalledWith("c1", "q2");
    expect(result).not.toBeUndefined();
  });

  it("responds after moving a question down", async () => {
    const { controller, repos } = questionController();
    const result = await (controller as any).moveQuestionDown("q2", {}, {});
    expect(repos.question.moveQuestionDown).toHaveBeenCalledWith("c1", "q2");
    expect(result).not.toBeUndefined();
  });
});
