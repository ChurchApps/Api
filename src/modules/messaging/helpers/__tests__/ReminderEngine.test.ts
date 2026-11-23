// Isolate the engine from the heavy delivery + cross-module deps.
import type { NotificationHelper } from "../NotificationHelper.js";
import type { Repos } from "../../repositories/index.js";
import type { ReminderDefinition, ReminderOccurrence } from "../../models/index.js";
import type { ReminderEntity, ReminderRecipient } from "../ReminderAdapter.js";

// Only the repos and methods a test touches exist; the rest of Repos is never reached. Mocks keep each
// method's parameters but return plain fixtures, so only the parameter lists are checked.
type MockedMethods<T> = { [M in keyof T]?: T[M] extends (...args: infer A) => unknown ? (...args: A) => unknown : T[M] };
type RepoMocks = { [K in keyof Repos]?: MockedMethods<Repos[K]> };
const asRepos = (mocks: RepoMocks) => mocks as Repos;

const createNotificationsMock: jest.MockedFunction<typeof NotificationHelper.createNotifications> = jest.fn();
jest.mock("../NotificationHelper.js", () => ({ NotificationHelper: { createNotifications: createNotificationsMock } }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch: async () => ({ timeZone: "UTC" }) }) }));

import { ReminderEngine } from "../ReminderEngine.js";
import { ReminderAdapterRegistry, ReminderAdapter } from "../ReminderAdapter.js";

const adapter: ReminderAdapter = {
  entityType: "ev",
  category: "event_reminders",
  contentType: "event",
  loadEntity: jest.fn(async () => ({ id: "E1", title: "Party" })),
  getOccurrences: jest.fn(async () => [{ startLocalDate: "2026-12-25", startLocalISO: "2026-12-25T10:00:00" }]),
  loadRecipients: jest.fn(async () => [{ personId: "P1" }, { personId: "P2" }]),
  link: () => "/x",
  renderMessage: () => "msg",
  buildEmails: jest.fn(async (): Promise<Record<string, { subject: string; html: string }> | null> => null)
};

beforeAll(() => ReminderAdapterRegistry.register(adapter));
beforeEach(() => createNotificationsMock.mockReset().mockResolvedValue([]));

describe("ReminderEngine.parseOffsets", () => {
  it("parses, dedups, sorts, clamps, and defaults", () => {
    expect(ReminderEngine.parseOffsets("1440,60,60")).toEqual([60, 1440]);
    expect(ReminderEngine.parseOffsets("")).toEqual([1440]);
    expect(ReminderEngine.parseOffsets(null)).toEqual([1440]);
    expect(ReminderEngine.parseOffsets("99999999,-5,0")).toEqual([0]); // out-of-range dropped
  });
});

describe("ReminderEngine.expandDefinition", () => {
  const def = {
    id: "D1",
    churchId: "CH1",
    entityType: "ev",
    entityId: "E1",
    category: "event_reminders",
    offsets: "1440,60",
    sendLocalTime: "09:00:00",
    timeZone: "UTC",
    channels: "push,email",
    enabled: true
  };

  it("upserts one row per offset with the right key and fireAt, skipping past ones", async () => {
    const upsert = jest.fn<Promise<void>, [ReminderOccurrence]>();
    ReminderEngine.init(asRepos({ reminderOccurrence: { upsert } }));
    const written = await ReminderEngine.expandDefinition(def, new Date("2026-12-01T00:00:00Z"));
    expect(written).toBe(2);
    const keys = upsert.mock.calls.map((c) => c[0].occurrenceKey);
    expect(keys).toContain("D1:2026-12-25T10:00:00:1440");
    expect(keys).toContain("D1:2026-12-25T10:00:00:60");
    const byKey = Object.fromEntries(upsert.mock.calls.map((c) => [c[0].occurrenceKey, c[0].fireAt.toISOString()]));
    expect(byKey["D1:2026-12-25T10:00:00:60"]).toBe("2026-12-25T08:00:00.000Z"); // 9am minus 60
    expect(byKey["D1:2026-12-25T10:00:00:1440"]).toBe("2026-12-24T09:00:00.000Z"); // day before 9am
  });

  it("skips occurrences whose fireAt is already in the past", async () => {
    const upsert = jest.fn<Promise<void>, [ReminderOccurrence]>();
    ReminderEngine.init(asRepos({ reminderOccurrence: { upsert } }));
    const written = await ReminderEngine.expandDefinition(def, new Date("2027-01-01T00:00:00Z"));
    expect(written).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does nothing for a disabled definition", async () => {
    const upsert = jest.fn<Promise<void>, [ReminderOccurrence]>();
    ReminderEngine.init(asRepos({ reminderOccurrence: { upsert } }));
    expect(await ReminderEngine.expandDefinition({ ...def, enabled: false }, new Date("2026-12-01T00:00:00Z"))).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("ReminderEngine.expandDefinition (scope path)", () => {
  type ScopeEntity = ReminderEntity & { localDate?: string };
  const scopeAdapter: ReminderAdapter<ScopeEntity> = {
    entityType: "plsc",
    category: "serving_schedule",
    contentType: "assignment",
    loadEntity: jest.fn(async (): Promise<ScopeEntity | null> => null),
    getOccurrences: jest.fn(async (entity: ScopeEntity) => [{ startLocalDate: entity.localDate, startLocalISO: `${entity.localDate}T10:00:00` }]),
    loadRecipients: jest.fn(async (): Promise<ReminderRecipient[]> => []),
    link: () => "/x",
    loadScopeEntities: jest.fn(async () => [{ id: "PL1", localDate: "2026-12-10" }, { id: "PL2", localDate: "2026-12-12" }])
  };
  beforeAll(() => ReminderAdapterRegistry.register(scopeAdapter));

  const scopeDef = {
    id: "SD1",
    churchId: "CH1",
    entityType: "plsc",
    scopeId: "PT1",
    category: "serving_schedule",
    offsets: "1440",
    sendLocalTime: "09:00:00",
    timeZone: "UTC",
    channels: "push,email",
    enabled: true
  };

  it("fans out per scope-entity, namespacing the occurrenceKey by entity id and querying the horizon window", async () => {
    const upsert = jest.fn<Promise<void>, [ReminderOccurrence]>();
    ReminderEngine.init(asRepos({ reminderOccurrence: { upsert } }));
    const now = new Date("2026-12-01T00:00:00Z");
    const written = await ReminderEngine.expandDefinition(scopeDef, now);

    expect(written).toBe(2);
    const call = (scopeAdapter.loadScopeEntities as jest.Mock).mock.calls[0];
    expect(call[0]).toBe("CH1");
    expect(call[1]).toBe("PT1");
    expect(call[2].getTime()).toBe(now.getTime());
    expect(call[3].getTime()).toBe(now.getTime() + 14 * 24 * 60 * 60000); // HORIZON_DAYS
    const rows = upsert.mock.calls.map((c) => c[0]);
    expect(rows.map((r) => r.occurrenceKey).sort()).toEqual(["SD1:PL1:2026-12-10T10:00:00:1440", "SD1:PL2:2026-12-12T10:00:00:1440"]);
    expect(rows.map((r) => r.entityId).sort()).toEqual(["PL1", "PL2"]); // concrete entity id, not null
  });

  it("re-expands idempotently: identical occurrenceKeys across runs", async () => {
    const upsert = jest.fn<Promise<void>, [ReminderOccurrence]>();
    ReminderEngine.init(asRepos({ reminderOccurrence: { upsert } }));
    const now = new Date("2026-12-01T00:00:00Z");
    await ReminderEngine.expandDefinition(scopeDef, now);
    const firstKeys = upsert.mock.calls.map((c) => c[0].occurrenceKey).sort();
    upsert.mockClear();
    await ReminderEngine.expandDefinition(scopeDef, now);
    const secondKeys = upsert.mock.calls.map((c) => c[0].occurrenceKey).sort();
    expect(secondKeys).toEqual(firstKeys);
  });

  it("returns 0 when an entityId-less definition has no scopeId", async () => {
    const upsert = jest.fn<Promise<void>, [ReminderOccurrence]>();
    ReminderEngine.init(asRepos({ reminderOccurrence: { upsert } }));
    expect(await ReminderEngine.expandDefinition({ ...scopeDef, scopeId: undefined }, new Date("2026-12-01T00:00:00Z"))).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("ReminderEngine.handleBusEvent (plan/task)", () => {
  function busRepos() {
    return {
      reminderDefinition: { loadForEntity: jest.fn(async (): Promise<ReminderDefinition[]> => []), loadForScope: jest.fn(async (): Promise<ReminderDefinition[]> => []) },
      reminderOccurrence: { cancelFuturePendingForDefinition: jest.fn(async () => {}), cancelPendingForEntity: jest.fn(async () => {}), upsert: jest.fn() }
    };
  }

  it("plan.updated re-expands the plan's entity definitions AND its planType scope", async () => {
    const repos = busRepos();
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.handleBusEvent("CH1", "plan.updated", { id: "PL1", planTypeId: "PT1" });
    expect(repos.reminderDefinition.loadForEntity).toHaveBeenCalledWith("CH1", "plan", "PL1");
    expect(repos.reminderDefinition.loadForScope).toHaveBeenCalledWith("CH1", "plan", "PT1");
  });

  it("plan.destroyed cancels the plan's pending occurrences", async () => {
    const repos = busRepos();
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.handleBusEvent("CH1", "plan.destroyed", { id: "PL9" });
    expect(repos.reminderOccurrence.cancelPendingForEntity).toHaveBeenCalledWith("CH1", "plan", "PL9");
  });

  it("task.updated re-expands the task's entity definitions", async () => {
    const repos = busRepos();
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.handleBusEvent("CH1", "task.updated", { id: "TK1" });
    expect(repos.reminderDefinition.loadForEntity).toHaveBeenCalledWith("CH1", "task", "TK1");
  });

  it("ignores events with no id", async () => {
    const repos = busRepos();
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.handleBusEvent("CH1", "plan.updated", {});
    expect(repos.reminderDefinition.loadForEntity).not.toHaveBeenCalled();
  });
});

describe("ReminderEngine.scan (dispatcher)", () => {
  const occ: ReminderOccurrence & { channels: string } = {
    id: "O1",
    churchId: "CH1",
    definitionId: "D1",
    entityType: "ev",
    entityId: "E1",
    category: "event_reminders",
    channels: "push,email",
    message: null,
    occLocalISO: "2026-12-25T10:00:00"
  };

  function buildRepos(opts: { claim?: boolean; alreadySent?: string[] }) {
    return {
      reminderOccurrence: {
        loadDue: jest.fn(async (): Promise<ReminderOccurrence[]> => [occ]),
        claim: jest.fn(async () => opts.claim ?? true),
        markSent: jest.fn(async () => {}),
        markCancelled: jest.fn(async () => {}),
        markFailed: jest.fn(async () => {}),
        markRetry: jest.fn(async () => {})
      },
      reminderDefinition: { load: jest.fn(async (): Promise<ReminderDefinition | null> => ({ id: "D1", enabled: true, recipientMode: "auto" })) },
      reminderSentLog: {
        loadPersonIdsForOccurrence: jest.fn(async (): Promise<string[]> => opts.alreadySent ?? []),
        insertIgnore: jest.fn(async () => {})
      }
    };
  }

  it("notifies fresh recipients, fences the ledger, and marks the occurrence sent", async () => {
    const repos = buildRepos({});
    ReminderEngine.init(asRepos(repos));
    const result = await ReminderEngine.scan();

    expect(result).toEqual({ processed: 1, sent: 2 });
    expect(createNotificationsMock).toHaveBeenCalledTimes(1);
    const args = createNotificationsMock.mock.calls[0];
    expect(args[0]).toEqual(["P1", "P2"]); // peopleIds
    expect(args[2]).toBe("event"); // adapter.contentType
    expect(args[3]).toBe("E1"); // entityId
    expect(args[7]).toMatchObject({ category: "event_reminders", deliveryStartLevel: 1 });
    expect(repos.reminderSentLog.insertIgnore).toHaveBeenCalledTimes(2);
    expect(repos.reminderOccurrence.markSent).toHaveBeenCalledWith("O1", 2);
  });

  it("skips recipients already in the sent ledger (idempotent on retry)", async () => {
    const repos = buildRepos({ alreadySent: ["P1"] });
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.scan();
    expect(createNotificationsMock.mock.calls[0][0]).toEqual(["P2"]);
    expect(repos.reminderSentLog.insertIgnore).toHaveBeenCalledTimes(1);
  });

  it("does not process an occurrence it fails to claim", async () => {
    const repos = buildRepos({ claim: false });
    ReminderEngine.init(asRepos(repos));
    const result = await ReminderEngine.scan();
    expect(result).toEqual({ processed: 0, sent: 0 });
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it("puts a failed occurrence back to pending until the attempt cap, then marks it failed", async () => {
    const repos = buildRepos({});
    repos.reminderDefinition.load = jest.fn(async (): Promise<ReminderDefinition | null> => { throw new Error("db down"); });
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.scan();
    expect(repos.reminderOccurrence.markRetry).toHaveBeenCalledWith("O1", "db down");
    expect(repos.reminderOccurrence.markFailed).not.toHaveBeenCalled();

    repos.reminderOccurrence.loadDue = jest.fn(async (): Promise<ReminderOccurrence[]> => [{ ...occ, attemptCount: 2 }]);
    await ReminderEngine.scan();
    expect(repos.reminderOccurrence.markFailed).toHaveBeenCalledWith("O1", "db down");
  });

  it("cancels an occurrence whose definition is gone/disabled", async () => {
    const repos = buildRepos({});
    repos.reminderDefinition.load = jest.fn(async (): Promise<ReminderDefinition | null> => null);
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.scan();
    expect(repos.reminderOccurrence.markCancelled).toHaveBeenCalledWith("O1");
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });
});

describe("ReminderEngine.scan channels->email wiring", () => {
  const occ: ReminderOccurrence = {
    id: "O1",
    churchId: "CH1",
    definitionId: "D1",
    entityType: "ev",
    entityId: "E1",
    category: "event_reminders",
    message: null,
    occLocalISO: "2026-12-25T10:00:00"
  };

  function buildRepos(defChannels: string | undefined) {
    return {
      reminderOccurrence: {
        loadDue: jest.fn(async (): Promise<ReminderOccurrence[]> => [occ]),
        claim: jest.fn(async () => true),
        markSent: jest.fn(async () => {}),
        markCancelled: jest.fn(async () => {}),
        markFailed: jest.fn(async () => {})
      },
      reminderDefinition: { load: jest.fn(async () => ({ id: "D1", enabled: true, recipientMode: "auto", channels: defChannels })) },
      reminderSentLog: {
        loadPersonIdsForOccurrence: jest.fn(async (): Promise<string[]> => []),
        insertIgnore: jest.fn(async () => {})
      }
    };
  }

  beforeEach(() => (adapter.buildEmails as jest.Mock).mockClear());

  it("passes emailImmediate + the adapter's buildEmails map when channels include email", async () => {
    const emailMap = { P1: { subject: "S1", html: "<p>H1</p>" }, P2: { subject: "S2", html: "<p>H2</p>" } };
    (adapter.buildEmails as jest.Mock).mockResolvedValueOnce(emailMap);
    const repos = buildRepos("push,email");
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.scan();

    expect(adapter.buildEmails).toHaveBeenCalledTimes(1);
    expect((adapter.buildEmails as jest.Mock).mock.calls[0][2]).toEqual([{ personId: "P1" }, { personId: "P2" }]);
    const options = createNotificationsMock.mock.calls[0][7];
    expect(options).toMatchObject({ category: "event_reminders", deliveryStartLevel: 1, emailImmediate: true, emailByPerson: emailMap });
  });

  it("keeps a send-now row on the email allowance when the timer retries it", async () => {
    const repos = buildRepos("email");
    repos.reminderOccurrence.loadDue.mockResolvedValue([{ ...occ, occurrenceKey: "D1:now:1764601200000" }]);
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.scan();
    expect(createNotificationsMock.mock.calls[0][7]).toMatchObject({ emailImmediate: true, churchAuthored: true });
  });

  it("leaves options identical to today when channels omit email", async () => {
    const repos = buildRepos("push");
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.scan();

    expect(adapter.buildEmails).not.toHaveBeenCalled();
    const options = createNotificationsMock.mock.calls[0][7];
    expect(options).toEqual({ category: "event_reminders", deliveryStartLevel: 1 });
  });
});

describe("ReminderEngine.sendNow", () => {
  const def = {
    id: "D1",
    churchId: "CH1",
    entityType: "ev",
    entityId: "E1",
    category: "event_reminders",
    offsets: "1440",
    sendLocalTime: "09:00:00",
    timeZone: "UTC",
    channels: "push",
    message: "Bring snacks",
    enabled: true
  };

  function buildRepos(opts: { claim?: boolean } = {}) {
    const rows: ReminderOccurrence[] = [{ id: "OLD", definitionId: "D1", occurrenceKey: "D1:2026-12-25T10:00:00:1440", status: "pending" }];
    return {
      rows,
      reminderOccurrence: {
        upsert: jest.fn(async (m: ReminderOccurrence) => { rows.push({ ...m, id: "NOW", status: "pending" }); }),
        loadByKey: jest.fn(async (key: string) => rows.find((r) => r.occurrenceKey === key)),
        claim: jest.fn(async () => opts.claim ?? true),
        markSent: jest.fn(async () => {}),
        markCancelled: jest.fn(async () => {}),
        markFailed: jest.fn(async () => {}),
        markRetry: jest.fn(async () => {})
      },
      reminderDefinition: { load: jest.fn(async () => def) },
      reminderSentLog: { loadPersonIdsForOccurrence: jest.fn(async (): Promise<string[]> => []), insertIgnore: jest.fn(async () => {}) }
    };
  }

  it("writes one due-now row for the next occurrence and sends it once to the adapter's recipients", async () => {
    const repos = buildRepos();
    ReminderEngine.init(asRepos(repos));
    const now = new Date("2026-12-01T15:00:00Z");
    const result = await ReminderEngine.sendNow(def, now);

    expect(result).toEqual({ recipients: 2, textsSent: 0, textsSkipped: 0 });
    expect(repos.reminderOccurrence.upsert).toHaveBeenCalledTimes(1);
    const row = repos.reminderOccurrence.upsert.mock.calls[0][0];
    expect(row.occurrenceKey).toBe(`D1:now:${now.getTime()}`);
    expect(row.occLocalISO).toBe("2026-12-25T10:00:00");
    expect(row.fireAt.getTime()).toBe(now.getTime());
    expect(createNotificationsMock).toHaveBeenCalledTimes(1);
    expect(createNotificationsMock.mock.calls[0][0]).toEqual(["P1", "P2"]);
    expect(repos.reminderOccurrence.markSent).toHaveBeenCalledWith("NOW", 2);
  });

  it("falls back to today in the church time zone when the entity has no upcoming occurrence", async () => {
    (adapter.getOccurrences as jest.Mock).mockResolvedValueOnce([]);
    const repos = buildRepos();
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.sendNow({ ...def, timeZone: "America/Chicago" }, new Date("2026-12-02T03:00:00Z"));
    expect(repos.reminderOccurrence.upsert.mock.calls[0][0].occLocalISO).toBe("2026-12-01T09:00:00");
  });

  it("rejects a scope definition and a disabled one without touching repos", async () => {
    const repos = buildRepos();
    ReminderEngine.init(asRepos(repos));
    await expect(ReminderEngine.sendNow({ ...def, entityId: undefined, scopeId: "PT1" })).rejects.toThrow();
    await expect(ReminderEngine.sendNow({ ...def, enabled: false })).rejects.toThrow();
    expect(repos.reminderOccurrence.upsert).not.toHaveBeenCalled();
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it("leaves the scheduled pending rows alone", async () => {
    const repos = buildRepos();
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.sendNow(def, new Date("2026-12-01T15:00:00Z"));
    expect(repos.rows.find((r) => r.id === "OLD").status).toBe("pending");
    expect(repos.reminderOccurrence.claim).not.toHaveBeenCalledWith("OLD");
  });

  it("draws an emailed send-now on the church's email allowance", async () => {
    const repos = buildRepos();
    repos.reminderDefinition.load.mockResolvedValue({ ...def, channels: "push,email" });
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.sendNow({ ...def, channels: "push,email" }, new Date("2026-12-01T15:00:00Z"));
    expect(createNotificationsMock.mock.calls[0][7]).toMatchObject({ emailImmediate: true, churchAuthored: true });
  });

  it("leaves a push-only send-now off the email allowance", async () => {
    const repos = buildRepos();
    ReminderEngine.init(asRepos(repos));
    await ReminderEngine.sendNow(def, new Date("2026-12-01T15:00:00Z"));
    expect(createNotificationsMock.mock.calls[0][7].churchAuthored).toBeUndefined();
  });

  it("returns 0 when the timer already claimed the row", async () => {
    const repos = buildRepos({ claim: false });
    ReminderEngine.init(asRepos(repos));
    expect(await ReminderEngine.sendNow(def, new Date("2026-12-01T15:00:00Z"))).toEqual({ recipients: 0, textsSent: 0, textsSkipped: 0 });
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });
});
