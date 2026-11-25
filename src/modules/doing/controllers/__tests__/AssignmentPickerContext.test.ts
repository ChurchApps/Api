import "reflect-metadata";

const canEditPosition = jest.fn(async () => true);
const loadPickerContext = jest.fn(async () => ({ lastServed: [{ personId: "p2", serviceDate: "2026-11-22" }], sameDay: [] }));
jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ PlanAuth: { canEditPosition } }));
jest.mock("../../helpers/PlanHelper", () => ({ PlanHelper: { loadPickerContext } }));
jest.mock("../../helpers/ReminderTokenHelper", () => ({ ReminderTokenHelper: {} }));
jest.mock("../../helpers/SignupDeadlineHelper", () => ({ SignupDeadlineHelper: {} }));
jest.mock("../../helpers/ServingFeedHelper", () => ({ ServingFeedHelper: {} }));

import express from "express";
import { AuthenticatedUser } from "@churchapps/apihelper";
import { Repos } from "../../repositories/index.js";
import { AssignmentController } from "../AssignmentController.js";

const req = { query: {} } as express.Request<{}, {}, null>;
const res = {} as express.Response;

function makeController() {
  const controller = new AssignmentController();
  controller.repos = {} as Repos;
  controller.actionWrapper = async (_req, _res, action) => action({ churchId: "c1", personId: "p1" } as AuthenticatedUser);
  return controller;
}

describe("GET /doing/assignments/picker/:positionId", () => {
  beforeEach(() => {
    canEditPosition.mockClear().mockResolvedValue(true);
    loadPickerContext.mockClear();
  });

  it("loads the picker data for the caller's church once they can edit the position", async () => {
    const controller = makeController();
    const result = await controller.getPickerContext("pos1", req, res);
    expect(canEditPosition).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1" }), "pos1");
    expect(loadPickerContext).toHaveBeenCalledWith("c1", "pos1", controller.repos);
    expect(result).toEqual({ lastServed: [{ personId: "p2", serviceDate: "2026-11-22" }], sameDay: [] });
  });

  it("refuses a caller who can't edit the position", async () => {
    canEditPosition.mockResolvedValue(false);
    const result = await makeController().getPickerContext("pos1", req, res);
    expect(result).toEqual({ obj: {}, status: 401 });
    expect(loadPickerContext).not.toHaveBeenCalled();
  });
});
