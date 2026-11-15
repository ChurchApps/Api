jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen" } }));

import { WorkflowStepRepo } from "../WorkflowStepRepo.js";
import { getDb } from "../../db/index.js";

describe("WorkflowStepRepo expectedResponseDays", () => {
  it("clears the stored due days when an update leaves them out", async () => {
    const updated: any[] = [];
    const updateChain = { set: (v: any) => { updated.push(v); return { where: () => ({ where: () => ({ execute: async () => undefined }) }) }; } };
    (getDb as jest.Mock).mockReturnValue({ updateTable: () => updateChain });

    await new WorkflowStepRepo().save({ id: "s1", churchId: "c1", workflowId: "w1", name: "Greet", sort: 1 });

    expect(updated[0]).toHaveProperty("expectedResponseDays", null);
  });
});
