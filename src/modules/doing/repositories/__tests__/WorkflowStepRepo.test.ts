jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen" } }));

import { WorkflowStepRepo } from "../WorkflowStepRepo.js";
import { getDb } from "../../db/index.js";
import type { WorkflowStep } from "../../models/index.js";

describe("WorkflowStepRepo expectedResponseDays", () => {
  it("clears the stored due days when an update leaves them out", async () => {
    const updated: Partial<WorkflowStep>[] = [];
    const updateChain = { set: (v: Partial<WorkflowStep>) => { updated.push(v); return { where: () => ({ where: () => ({ execute: async (): Promise<void> => undefined }) }) }; } };
    (getDb as jest.Mock).mockReturnValue({ updateTable: () => updateChain });

    await new WorkflowStepRepo().save({ id: "s1", churchId: "c1", workflowId: "w1", name: "Greet", sort: 1 });

    expect(updated[0]).toHaveProperty("expectedResponseDays", null);
  });
});

describe("WorkflowStepRepo instructions", () => {
  const captureUpdate = () => {
    const updated: Partial<WorkflowStep>[] = [];
    const updateChain = { set: (v: Partial<WorkflowStep>) => { updated.push(v); return { where: () => ({ where: () => ({ execute: async (): Promise<void> => undefined }) }) }; } };
    (getDb as jest.Mock).mockReturnValue({ updateTable: () => updateChain });
    return updated;
  };

  it("saves the step instructions", async () => {
    const updated = captureUpdate();
    await new WorkflowStepRepo().save({ id: "s1", churchId: "c1", workflowId: "w1", name: "Call", sort: 1, instructions: "Ask how their first visit went." });
    expect(updated[0]).toHaveProperty("instructions", "Ask how their first visit went.");
  });

  it("clears instructions left blank", async () => {
    const updated = captureUpdate();
    await new WorkflowStepRepo().save({ id: "s1", churchId: "c1", workflowId: "w1", name: "Call", sort: 1, instructions: "" });
    expect(updated[0]).toHaveProperty("instructions", null);
  });
});
