import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../models/index", () => ({}));

import express from "express";
import { QuestionController } from "../QuestionController.js";

const req = {} as express.Request<{}, {}, null>;
const res = {} as express.Response;

function questionController() {
  const repos = {
    question: {
      load: jest.fn(async () => ({ id: "q2", formId: "f1", sort: 2 })),
      moveQuestionUp: jest.fn(async (): Promise<void> => undefined),
      moveQuestionDown: jest.fn(async (): Promise<void> => undefined)
    }
  };
  const au = { churchId: "c1", id: "u1" };
  const controller = new QuestionController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au),
    formAccess: jest.fn(async () => true)
  });
  return { controller, repos };
}

// Issue 1254: the sort routes returned undefined, so inversify never sent a response and
// each reorder hung until it timed out ("Something went wrong" about a minute later).
describe("QuestionController sort routes (issue 1254)", () => {
  it("responds after moving a question up", async () => {
    const { controller, repos } = questionController();
    const result = await controller.moveQuestionUp("q2", req, res);
    expect(repos.question.moveQuestionUp).toHaveBeenCalledWith("c1", "q2");
    expect(result).not.toBeUndefined();
  });

  it("responds after moving a question down", async () => {
    const { controller, repos } = questionController();
    const result = await controller.moveQuestionDown("q2", req, res);
    expect(repos.question.moveQuestionDown).toHaveBeenCalledWith("c1", "q2");
    expect(result).not.toBeUndefined();
  });
});
