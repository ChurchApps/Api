const mockLoadPeople = jest.fn();
const mockLoadChurch = jest.fn();
const mockGetPeopleIds = jest.fn();
jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: () => ({ loadPeople: mockLoadPeople, loadChurch: mockLoadChurch }) }));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../db/index.js", () => ({ getDb: jest.fn(), withDoingConnection: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ DateHelper: {}, UniqueIdHelper: { shortId: () => "gen" } }));
jest.mock("../WorkflowHelper.js", () => ({ WorkflowHelper: {} }));
jest.mock("../EventTriggerHelper.js", () => ({ EventTriggerHelper: {} }));
jest.mock("../ConjunctionHelper.js", () => ({ ConjunctionHelper: { getPeopleIdsForTrigger: (...args: unknown[]) => mockGetPeopleIds(...args) } }));

import { ExecutionHelper } from "../ExecutionHelper.js";
import { RuleEngine } from "../RuleEngine.js";
import { TaskRepo } from "../../repositories/TaskRepo.js";
import { getDb } from "../../db/index.js";
import type { Repos } from "../../repositories/Repos.js";
import type { WorkflowTrigger } from "../../models/index.js";

// Issue #1656: birthday/anniversary rules made cards from Run but not on their own.
// The scheduler must evaluate each church's rules just after its local midnight, and a card
// from the previous period must not block this period's card.

// A tiny in-memory stand-in for the Kysely chain, enough for TaskRepo.loadByTriggerIdContent.
type Row = Record<string, unknown>;
interface FakeChain {
  selectAll: () => FakeChain;
  orderBy: () => FakeChain;
  where: (col: string, op: string, val: unknown) => FakeChain;
  execute: () => Promise<Row[]>;
}
const fakeDb = (rows: Row[]) => {
  const preds: ((r: Row) => boolean)[] = [];
  // Values compared here are Dates or numbers.
  const cmp = (a: unknown, b: unknown) => ((a instanceof Date ? a.getTime() : a) as number) - ((b instanceof Date ? b.getTime() : b) as number);
  const chain: FakeChain = {
    selectAll: () => chain,
    orderBy: () => chain,
    where: (col: string, op: string, val: unknown) => {
      preds.push((r) => {
        switch (op) {
          case "=": return r[col] === val;
          case "in": return (val as unknown[]).includes(r[col]);
          case ">": return cmp(r[col], val) > 0;
          case ">=": return cmp(r[col], val) >= 0;
          default: throw new Error("unsupported op " + op);
        }
      });
      return chain;
    },
    execute: async () => rows.filter((r) => preds.every((p) => p(r)))
  };
  return { selectFrom: () => chain };
};

describe("Scheduled rules use the church's calendar day", () => {
  let started: string[];

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    started = [];
    mockGetPeopleIds.mockResolvedValue(["p1"]);
    mockLoadChurch.mockResolvedValue({ id: "c1", timeZone: "America/Chicago" });
    mockLoadPeople.mockImplementation((_c: string, ids: string[]) => Promise.resolve(ids.map((id) => ({ id, displayName: id }))));
    jest.spyOn(ExecutionHelper, "startAndAttempt").mockImplementation(async (_t, subject) => { started.push(subject.id); return undefined; });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const run = async (now: string, recurs: string, cards: { at: string }[]) => {
    jest.setSystemTime(new Date(now));
    const rows = cards.map((c, i) => ({ id: "t" + i, churchId: "c1", triggerId: "r1", associatedWithType: "person", associatedWithId: "p1", dateCreated: new Date(c.at) }));
    (getDb as jest.Mock).mockReturnValue(fakeDb(rows));
    const rule: WorkflowTrigger = { id: "r1", churchId: "c1", workflowId: "w1", triggerKind: "schedule", recurs, oncePerSubject: false };
    return ExecutionHelper.runScheduledRule(rule, { task: new TaskRepo() } as Repos);
  };

  it("a daily rule fires again the next night even though yesterday's card was made a few seconds later in the day", async () => {
    // 00:10 in Chicago; yesterday's nightly run made the card at 00:10:30.
    const result = await run("2026-11-21T06:10:00Z", "daily", [{ at: "2026-11-20T06:10:30Z" }]);
    expect(started).toEqual(["p1"]);
    expect(result).toEqual({ created: 1, skipped: 0 });
  });

  it("a daily rule does not add a second card the same church day", async () => {
    // Run pressed at 2 PM Chicago after the nightly run made the card at 00:10.
    const result = await run("2026-11-21T20:00:00Z", "daily", [{ at: "2026-11-21T06:10:30Z" }]);
    expect(started).toEqual([]);
    expect(result).toEqual({ created: 0, skipped: 1 });
  });

  it("a yearly birthday rule fires this year when last year's card was made by Run later in the day", async () => {
    const result = await run("2026-11-21T06:10:00Z", "yearly", [{ at: "2025-11-21T20:00:00Z" }]);
    expect(started).toEqual(["p1"]);
    expect(result).toEqual({ created: 1, skipped: 0 });
  });

  it("a yearly birthday rule does not duplicate when Run is pressed after the nightly card", async () => {
    const result = await run("2026-11-21T20:00:00Z", "yearly", [{ at: "2026-11-21T06:10:30Z" }]);
    expect(started).toEqual([]);
    expect(result).toEqual({ created: 0, skipped: 1 });
  });
});

describe("RuleEngine.runScheduled near each church's midnight", () => {
  let ran: string[];
  const repos = Object.assign({} as Repos, { workflowTrigger: { loadScheduledAllChurches: jest.fn() } });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    ran = [];
    repos.workflowTrigger.loadScheduledAllChurches.mockResolvedValue([
      { id: "chicago", churchId: "cChicago", workflowId: "w1", triggerKind: "schedule", recurs: "yearly" },
      { id: "london", churchId: "cLondon", workflowId: "w1", triggerKind: "schedule", recurs: "yearly" }
    ]);
    mockLoadChurch.mockImplementation((id: string) => Promise.resolve({ id, timeZone: id === "cChicago" ? "America/Chicago" : "Europe/London" }));
    jest.spyOn(ExecutionHelper, "runScheduledRule").mockImplementation(async (rule) => { ran.push(rule.id); return { created: 1, skipped: 0 }; });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("does not evaluate a Central church's rules at 11 PM the night before", async () => {
    // 05:00 UTC, the old daily run time, is 23:00 on Nov 20 in Chicago and 05:00 on Nov 21 in London.
    jest.setSystemTime(new Date("2026-11-21T05:00:21Z"));
    await RuleEngine.runScheduled(repos, { nearChurchMidnight: true });
    expect(ran).toEqual([]);
  });

  it("evaluates each church's rules in the half hour after its own midnight", async () => {
    jest.setSystemTime(new Date("2026-11-21T06:10:00Z"));
    const result = await RuleEngine.runScheduled(repos, { nearChurchMidnight: true });
    expect(ran).toEqual(["chicago"]);
    expect(result).toEqual({ rules: 1, created: 1, skipped: 0 });

    ran = [];
    jest.setSystemTime(new Date("2026-11-21T00:20:00Z"));
    await RuleEngine.runScheduled(repos, { nearChurchMidnight: true });
    expect(ran).toEqual(["london"]);
  });
});
