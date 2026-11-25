jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen" } }));

import { WorkflowTriggerRepo } from "../WorkflowTriggerRepo.js";
import { TaskRepo } from "../TaskRepo.js";
import { getDb } from "../../db/index.js";
import type { WorkflowTrigger } from "../../models/index.js";

describe("WorkflowTriggerRepo allowRepeatAfterClose", () => {
  const repo = new WorkflowTriggerRepo();

  it("writes the flag on create (default off) and on update", async () => {
    const inserted: Partial<WorkflowTrigger>[] = [];
    const updated: Partial<WorkflowTrigger>[] = [];
    const insertChain = { values: (v: Partial<WorkflowTrigger>) => { inserted.push(v); return { execute: async () => undefined }; } };
    const updateChain = { set: (v: Partial<WorkflowTrigger>) => { updated.push(v); return { where: () => ({ where: () => ({ execute: async () => undefined }) }) }; } };
    (getDb as jest.Mock).mockReturnValue({ insertInto: () => insertChain, updateTable: () => updateChain });

    await repo.save({ churchId: "c1", name: "Returning visitor", workflowId: "w1" });
    await repo.save({ churchId: "c1", name: "Returning visitor", workflowId: "w1", allowRepeatAfterClose: true });
    await repo.save({ id: "t1", churchId: "c1", name: "Returning visitor", workflowId: "w1", allowRepeatAfterClose: true });

    expect(inserted[0]).toHaveProperty("allowRepeatAfterClose", false);
    expect(inserted[1]).toHaveProperty("allowRepeatAfterClose", true);
    expect(updated[0]).toHaveProperty("allowRepeatAfterClose", true);
  });
});

describe("TaskRepo.loadOpenBySubjectInWorkflow", () => {
  it("ignores closed cards", async () => {
    const wheres: [string, string, unknown][] = [];
    interface SelectChain { selectAll: () => SelectChain; where: (col: string, op: string, val: unknown) => SelectChain; executeTakeFirst: () => Promise<undefined> }
    const chain: SelectChain = {
      selectAll: () => chain,
      where: (col: string, op: string, val: unknown) => { wheres.push([col, op, val]); return chain; },
      executeTakeFirst: async () => undefined
    };
    (getDb as jest.Mock).mockReturnValue({ selectFrom: () => chain });

    const result = await new TaskRepo().loadOpenBySubjectInWorkflow("c1", "w1", "person", "p1");

    expect(result).toBeNull();
    expect(wheres).toEqual(expect.arrayContaining([["workflowId", "=", "w1"], ["associatedWithId", "=", "p1"], ["status", "<>", "Closed"]]));
  });
});
