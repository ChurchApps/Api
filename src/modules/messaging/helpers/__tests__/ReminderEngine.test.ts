// Isolate the engine from the heavy delivery + cross-module deps.
const createNotificationsMock = jest.fn() as jest.MockedFunction<any>;
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
  buildEmails: jest.fn(async () => null)
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
    const upsert = jest.fn();
    ReminderEngine.init({ reminderOccurrence: { upsert } } as any);
    const written = await ReminderEngine.expandDefinition(def as any, new Date("2026-12-01T00:00:00Z"));
    expect(written).toBe(2);
    const keys = upsert.mock.calls.map((c) => c[0].occurrenceKey);
    expect(keys).toContain("D1:2026-12-25T10:00:00:1440");
    expect(keys).toContain("D1:2026-12-25T10:00:00:60");
    const byKey = Object.fromEntries(upsert.mock.calls.map((c) => [c[0].occurrenceKey, c[0].fireAt.toISOString()]));
    expect(byKey["D1:2026-12-25T10:00:00:60"]).toBe("2026-12-25T08:00:00.000Z"); // 9am minus 60
    expect(byKey["D1:2026-12-25T10:00:00:1440"]).toBe("2026-12-24T09:00:00.000Z"); // day before 9am
  });

  it("skips occurrences whose fireAt is already in the past", async () => {
    const upsert = jest.fn();
    ReminderEngine.init({ reminderOccurrence: { upsert } } as any);
    const written = await ReminderEngine.expandDefinition(def as any, new Date("2027-01-01T00:00:00Z"));
    expect(written).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does nothing for a disabled definition", async () => {
    const upsert = jest.fn();
    ReminderEngine.init({ reminderOccurrence: { upsert } } as any);
    expect(await ReminderEngine.expandDefinition({ ...def, enabled: false } as any, new Date("2026-12-01T00:00:00Z"))).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("ReminderEngine.expandDefinition (scope path)", () => {
  const scopeAdapter: ReminderAdapter = {
    entityType: "plsc",
    category: "serving_schedule",
    contentType: "assignment",
    loadEntity: jest.fn(async () => null),
    getOccurrences: jest.fn(async (entity: any) => [{ startLocalDate: entity.localDate, startLocalISO: `${entity.localDate}T10:00:00` }]),
    loadRecipients: jest.fn(async () => []),
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
    const upsert = jest.fn();
    ReminderEngine.init({ reminderOccurrence: { upsert } } as any);
    const now = new Date("2026-12-01T00:00:00Z");
    const written = await ReminderEngine.expandDefinition(scopeDef as any, now);

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
    const upsert = jest.fn();
    ReminderEngine.init({ reminderOccurrence: { upsert } } as any);
    const now = new Date("2026-12-01T00:00:00Z");
    await ReminderEngine.expandDefinition(scopeDef as any, now);
    const firstKeys = upsert.mock.calls.map((c) => c[0].occurrenceKey).sort();
    upsert.mockClear();
    await ReminderEngine.expandDefinition(scopeDef as any, now);
    const secondKeys = upsert.mock.calls.map((c) => c[0].occurrenceKey).sort();
    expect(secondKeys).toEqual(firstKeys);
  });

  it("returns 0 when an entityId-less definition has no scopeId", async () => {
    const upsert = jest.fn();
    ReminderEngine.init({ reminderOccurrence: { upsert } } as any);
    expect(await ReminderEngine.expandDefinition({ ...scopeDef, scopeId: undefined } as any, new Date("2026-12-01T00:00:00Z"))).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("ReminderEngine.handleBusEvent (plan/task)", () => {
  function busRepos() {
    return {
      reminderDefinition: { loadForEntity: jest.fn(async () => []), loadForScope: jest.fn(async () => []) },
      reminderOccurrence: { cancelPendingForDefinition: jest.fn(async () => {}), cancelPendingForEntity: jest.fn(async () => {}), upsert: jest.fn() }
    } as any;
  }

  it("plan.updated re-expands the plan's entity definitions AND its planType scope", async () => {
    const repos = busRepos();
    ReminderEngine.init(repos);
    await ReminderEngine.handleBusEvent("CH1", "plan.updated", { id: "PL1", planTypeId: "PT1" });
    expect(repos.reminderDefinition.loadForEntity).toHaveBeenCalledWith("CH1", "plan", "PL1");
    expect(repos.reminderDefinition.loadForScope).toHaveBeenCalledWith("CH1", "plan", "PT1");
  });

  it("plan.destroyed cancels the plan's pending occurrences", async () => {
    const repos = busRepos();
    ReminderEngine.init(repos);
    await ReminderEngine.handleBusEvent("CH1", "plan.destroyed", { id: "PL9" });
    expect(repos.reminderOccurrence.cancelPendingForEntity).toHaveBeenCalledWith("CH1", "plan", "PL9");
  });

  it("task.updated re-expands the task's entity definitions", async () => {
    const repos = busRepos();
    ReminderEngine.init(repos);
    await ReminderEngine.handleBusEvent("CH1", "task.updated", { id: "TK1" });
    expect(repos.reminderDefinition.loadForEntity).toHaveBeenCalledWith("CH1", "task", "TK1");
  });

  it("ignores events with no id", async () => {
    const repos = busRepos();
    ReminderEngine.init(repos);
    await ReminderEngine.handleBusEvent("CH1", "plan.updated", {});
    expect(repos.reminderDefinition.loadForEntity).not.toHaveBeenCalled();
  });
});

describe("ReminderEngine.scan (dispatcher)", () => {
  const occ = {
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
        loadDue: jest.fn(async () => [occ]),
        claim: jest.fn(async () => opts.claim ?? true),
        markSent: jest.fn(async () => {}),
        markCancelled: jest.fn(async () => {}),
        markFailed: jest.fn(async () => {})
      },
      reminderDefinition: { load: jest.fn(async () => ({ id: "D1", enabled: true, recipientMode: "auto" })) },
      reminderSentLog: {
        loadPersonIdsForOccurrence: jest.fn(async () => opts.alreadySent ?? []),
        insertIgnore: jest.fn(async () => {})
      }
    } as any;
  }

  it("notifies fresh recipients, fences the ledger, and marks the occurrence sent", async () => {
    const repos = buildRepos({});
    ReminderEngine.init(repos);
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
    ReminderEngine.init(repos);
    await ReminderEngine.scan();
    expect(createNotificationsMock.mock.calls[0][0]).toEqual(["P2"]);
    expect(repos.reminderSentLog.insertIgnore).toHaveBeenCalledTimes(1);
  });

  it("does not process an occurrence it fails to claim", async () => {
    const repos = buildRepos({ claim: false });
    ReminderEngine.init(repos);
    const result = await ReminderEngine.scan();
    expect(result).toEqual({ processed: 0, sent: 0 });
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it("cancels an occurrence whose definition is gone/disabled", async () => {
    const repos = buildRepos({});
    repos.reminderDefinition.load = jest.fn(async () => null);
    ReminderEngine.init(repos);
    await ReminderEngine.scan();
    expect(repos.reminderOccurrence.markCancelled).toHaveBeenCalledWith("O1");
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });
});

describe("ReminderEngine.scan channels->email wiring", () => {
  const occ = {
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
        loadDue: jest.fn(async () => [occ]),
        claim: jest.fn(async () => true),
        markSent: jest.fn(async () => {}),
        markCancelled: jest.fn(async () => {}),
        markFailed: jest.fn(async () => {})
      },
      reminderDefinition: { load: jest.fn(async () => ({ id: "D1", enabled: true, recipientMode: "auto", channels: defChannels })) },
      reminderSentLog: {
        loadPersonIdsForOccurrence: jest.fn(async () => []),
        insertIgnore: jest.fn(async () => {})
      }
    } as any;
  }

  beforeEach(() => (adapter.buildEmails as jest.Mock).mockClear());

  it("passes emailImmediate + the adapter's buildEmails map when channels include email", async () => {
    const emailMap = { P1: { subject: "S1", html: "<p>H1</p>" }, P2: { subject: "S2", html: "<p>H2</p>" } };
    (adapter.buildEmails as jest.Mock).mockResolvedValueOnce(emailMap);
    const repos = buildRepos("push,email");
    ReminderEngine.init(repos);
    await ReminderEngine.scan();

    expect(adapter.buildEmails).toHaveBeenCalledTimes(1);
    expect((adapter.buildEmails as jest.Mock).mock.calls[0][2]).toEqual([{ personId: "P1" }, { personId: "P2" }]);
    const options = createNotificationsMock.mock.calls[0][7];
    expect(options).toMatchObject({ category: "event_reminders", deliveryStartLevel: 1, emailImmediate: true, emailByPerson: emailMap });
  });

  it("leaves options identical to today when channels omit email", async () => {
    const repos = buildRepos("push");
    ReminderEngine.init(repos);
    await ReminderEngine.scan();

    expect(adapter.buildEmails).not.toHaveBeenCalled();
    const options = createNotificationsMock.mock.calls[0][7];
    expect(options).toEqual({ category: "event_reminders", deliveryStartLevel: 1 });
  });
});
