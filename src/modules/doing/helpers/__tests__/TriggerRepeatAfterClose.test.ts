jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: () => ({}) }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));
jest.mock("../WorkflowHelper.js", () => ({ WorkflowHelper: {} }));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: {} }));

import { ExecutionHelper } from "../ExecutionHelper.js";

// Issue #1370: "Add again after their card is closed" lets a person get a new card once
// their old one on the board is closed, but never two open cards at the same time.
describe("ExecutionHelper.existingCardForSubject", () => {
  const openCard = { id: "t-open", status: "Open" };
  const closedCard = { id: "t-closed", status: "Closed" };

  const reposWith = (anyCard: any, openOnlyCard: any) => ({
    task: {
      loadBySubjectInWorkflow: jest.fn().mockResolvedValue(anyCard),
      loadOpenBySubjectInWorkflow: jest.fn().mockResolvedValue(openOnlyCard)
    }
  }) as any;

  const trigger = (extra: any) => ({ churchId: "c1", workflowId: "w1", oncePerSubject: true, ...extra });

  it("an open card still blocks a new one when repeat after close is on", async () => {
    const repos = reposWith(openCard, openCard);
    const card = await ExecutionHelper.existingCardForSubject(trigger({ allowRepeatAfterClose: true }), "person", "p1", repos);
    expect(card).toEqual(openCard);
    expect(repos.task.loadOpenBySubjectInWorkflow).toHaveBeenCalledWith("c1", "w1", "person", "p1");
  });

  it("a closed card no longer blocks when repeat after close is on", async () => {
    const repos = reposWith(closedCard, null);
    const card = await ExecutionHelper.existingCardForSubject(trigger({ allowRepeatAfterClose: true }), "person", "p1", repos);
    expect(card).toBeNull();
  });

  it("a closed card still blocks when repeat after close is off", async () => {
    const repos = reposWith(closedCard, null);
    const card = await ExecutionHelper.existingCardForSubject(trigger({ allowRepeatAfterClose: false }), "person", "p1", repos);
    expect(card).toEqual(closedCard);
    expect(repos.task.loadOpenBySubjectInWorkflow).not.toHaveBeenCalled();
  });

  it("treats a missing flag and a bit(1) zero as off", async () => {
    for (const flag of [undefined, null, Buffer.from([0])]) {
      const repos = reposWith(closedCard, null);
      expect(await ExecutionHelper.existingCardForSubject(trigger({ allowRepeatAfterClose: flag }), "person", "p1", repos)).toEqual(closedCard);
    }
    const repos = reposWith(closedCard, null);
    expect(await ExecutionHelper.existingCardForSubject(trigger({ allowRepeatAfterClose: Buffer.from([1]) }), "person", "p1", repos)).toBeNull();
  });
});
