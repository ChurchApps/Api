const mockLoadPeople = jest.fn();
const mockGetPeopleIds = jest.fn();
jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: () => ({ loadPeople: mockLoadPeople }) }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));
jest.mock("../WorkflowHelper.js", () => ({ WorkflowHelper: {} }));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: { getPeopleIdsForTrigger: (...args: unknown[]) => mockGetPeopleIds(...args) } }));

import { ExecutionHelper } from "../ExecutionHelper.js";
import type { Repos } from "../../repositories/Repos.js";
import type { TaskRepo } from "../../repositories/TaskRepo.js";
import type { Task, WorkflowTrigger } from "../../models/index.js";

// Issue #1374: "On a schedule" rules honour "Only once per person" the same way event rules do.
describe("ExecutionHelper.runScheduledRule with Only once per person", () => {
  const openCard = { id: "t-open", status: "Open", associatedWithId: "p1" };
  const closedCard = { id: "t-closed", status: "Closed", associatedWithId: "p1" };
  let started: string[];

  const reposWith = (anyCard: Task | null, openOnlyCard: Task | null) => {
    const task: Partial<TaskRepo> = {
      // Nothing yet in this period, so only the once-per-person check can skip p1.
      loadByTriggerIdContent: jest.fn().mockResolvedValue([]),
      loadBySubjectInWorkflow: jest.fn().mockImplementation((_c: string, _w: string, _t: string, id: string) => Promise.resolve(id === "p1" ? anyCard : null)),
      loadOpenBySubjectInWorkflow: jest.fn().mockImplementation((_c: string, _w: string, _t: string, id: string) => Promise.resolve(id === "p1" ? openOnlyCard : null))
    };
    return { task } as Repos;
  };

  const rule = (extra: Partial<WorkflowTrigger>): WorkflowTrigger => ({ id: "r1", churchId: "c1", workflowId: "w1", triggerKind: "schedule", recurs: "weekly", ...extra });

  beforeEach(() => {
    started = [];
    mockGetPeopleIds.mockResolvedValue(["p1", "p2"]);
    mockLoadPeople.mockImplementation((_c: string, ids: string[]) => Promise.resolve(ids.map((id) => ({ id, displayName: id }))));
    jest.spyOn(ExecutionHelper, "startAndAttempt").mockImplementation(async (_t, subject) => { started.push(subject.id); return undefined; });
  });

  afterEach(() => jest.restoreAllMocks());

  it("does not add a card for someone who still has an open one", async () => {
    const result = await ExecutionHelper.runScheduledRule(rule({ oncePerSubject: true, allowRepeatAfterClose: true }), reposWith(openCard, openCard));
    expect(started).toEqual(["p2"]);
    expect(result).toEqual({ created: 1, skipped: 1 });
  });

  it("adds again after the card is closed when repeat after close is on", async () => {
    const result = await ExecutionHelper.runScheduledRule(rule({ oncePerSubject: true, allowRepeatAfterClose: true }), reposWith(closedCard, null));
    expect(started).toEqual(["p1", "p2"]);
    expect(result).toEqual({ created: 2, skipped: 0 });
  });

  it("a closed card still blocks when repeat after close is off", async () => {
    const result = await ExecutionHelper.runScheduledRule(rule({ oncePerSubject: true, allowRepeatAfterClose: false }), reposWith(closedCard, null));
    expect(started).toEqual(["p2"]);
    expect(result).toEqual({ created: 1, skipped: 1 });
  });

  it("with the switch off only the per-period check applies", async () => {
    const repos = reposWith(openCard, openCard);
    const result = await ExecutionHelper.runScheduledRule(rule({ oncePerSubject: false }), repos);
    expect(started).toEqual(["p1", "p2"]);
    expect(result).toEqual({ created: 2, skipped: 0 });
    expect(repos.task.loadBySubjectInWorkflow).not.toHaveBeenCalled();
  });
});
