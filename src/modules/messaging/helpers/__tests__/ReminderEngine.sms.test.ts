// Text reminder channel: opt-in (allowSms), skips opted-out people and missing numbers, sends through the church's provider.
const createNotificationsMock = jest.fn() as jest.MockedFunction<any>;
const sendPersonTextMock = jest.fn() as jest.MockedFunction<any>;
const people: Record<string, any> = {
  P1: { id: "P1", firstName: "Donald", lastName: "Clark", mobilePhone: "555-0101", optedOut: false },
  P2: { id: "P2", firstName: "Carol", lastName: "Clark", mobilePhone: "555-0102", optedOut: true },
  P3: { id: "P3", firstName: "Sam", lastName: "Smith", mobilePhone: "", optedOut: false },
  P4: { id: "P4", firstName: "Pat", lastName: "Jones", mobilePhone: "555-0104", optedOut: false }
};
jest.mock("../NotificationHelper.js", () => ({ NotificationHelper: { createNotifications: createNotificationsMock } }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({
  getMembershipModuleGateway: () => ({
    loadChurch: async () => ({ name: "Grace Church", timeZone: "UTC" }),
    loadPerson: async (_c: string, id: string) => people[id] || null
  })
}));
jest.mock("../../../../shared/modules/MessagingModuleGateway.js", () => ({ getMessagingModuleGateway: () => ({ sendPersonText: sendPersonTextMock }) }));

import { ReminderEngine } from "../ReminderEngine.js";
import { ReminderAdapterRegistry, ReminderAdapter } from "../ReminderAdapter.js";

const adapter: ReminderAdapter = {
  entityType: "smsplan",
  category: "serving_schedule",
  contentType: "assignment",
  loadEntity: jest.fn(async () => ({ id: "PL1", name: "Sunday Service" })),
  getOccurrences: jest.fn(async () => []),
  loadRecipients: jest.fn(async () => [{ personId: "P1" }, { personId: "P2" }, { personId: "P3" }, { personId: "P4" }]),
  link: () => "/x",
  renderMessage: (entity: any) => `Reminder: you're serving at ${entity.name}`
};

const occ = { id: "O1", churchId: "CH1", definitionId: "D1", entityType: "smsplan", entityId: "PL1", category: "serving_schedule", message: null, occLocalISO: "2026-12-25T10:00:00" };

function buildRepos(channels: string) {
  return {
    reminderOccurrence: {
      loadDue: jest.fn(async () => [occ]),
      claim: jest.fn(async () => true),
      markSent: jest.fn(async () => {}),
      markCancelled: jest.fn(async () => {}),
      markFailed: jest.fn(async () => {}),
      markRetry: jest.fn(async () => {})
    },
    reminderDefinition: { load: jest.fn(async () => ({ id: "D1", enabled: true, channels })) },
    reminderSentLog: { loadPersonIdsForOccurrence: jest.fn(async () => []), insertIgnore: jest.fn(async () => {}) },
    // P4 never turned texts on; everyone else did.
    notificationPreference: { loadByPersonIds: jest.fn(async () => ["P1", "P2", "P3"].map((personId) => ({ churchId: "CH1", personId, allowSms: true, allowPush: true }))) },
    notificationPreferenceOverride: { loadByPersonIds: jest.fn(async () => []) }
  } as any;
}

const smsRows = (repos: any) => repos.reminderSentLog.insertIgnore.mock.calls.map((c: any[]) => c[0]).filter((r: any) => r.channel === "sms");

beforeAll(() => ReminderAdapterRegistry.register(adapter));
beforeEach(() => {
  createNotificationsMock.mockReset().mockResolvedValue([]);
  sendPersonTextMock.mockReset().mockResolvedValue({ ok: true });
});

describe("ReminderEngine.scan text channel", () => {
  it("texts only opted-in people with a number who have not opted out", async () => {
    const repos = buildRepos("push,sms");
    ReminderEngine.init(repos);
    await ReminderEngine.scan();

    expect(sendPersonTextMock).toHaveBeenCalledTimes(1);
    const [churchId, personId, recipient, body, churchName] = sendPersonTextMock.mock.calls[0];
    expect([churchId, personId, recipient.phoneNumber, churchName]).toEqual(["CH1", "P1", "555-0101", "Grace Church"]);
    expect(body).toBe("Grace Church: Reminder: you're serving at Sunday Service Reply STOP to opt out.");

    const rows = smsRows(repos);
    const byPerson = Object.fromEntries(rows.map((r: any) => [r.personId, `${r.status}:${r.reason || ""}`]));
    expect(byPerson).toEqual({ P1: "sent:", P2: "suppressed:opted_out", P3: "suppressed:no_phone", P4: "suppressed:channel_off" });
    expect(new Set(rows.map((r: any) => r.idempotencyKey)).size).toBe(4);
  });

  it("sends no texts when the reminder does not include the Text channel", async () => {
    const repos = buildRepos("push,email");
    ReminderEngine.init(repos);
    await ReminderEngine.scan();
    expect(sendPersonTextMock).not.toHaveBeenCalled();
    expect(smsRows(repos)).toHaveLength(0);
  });

  it("stops texting once the church has no provider", async () => {
    sendPersonTextMock.mockResolvedValue({ ok: false, reason: "no_provider" });
    const repos = buildRepos("sms");
    repos.notificationPreference.loadByPersonIds = jest.fn(async () => ["P1", "P4"].map((personId) => ({ churchId: "CH1", personId, allowSms: true })));
    ReminderEngine.init(repos);
    await ReminderEngine.scan();
    expect(sendPersonTextMock).toHaveBeenCalledTimes(1);
    expect(smsRows(repos).filter((r: any) => r.reason === "no_provider").map((r: any) => r.personId)).toEqual(["P1", "P4"]);
    expect(repos.reminderOccurrence.markSent).toHaveBeenCalledWith("O1", 4);
  });
});

describe("ReminderEngine.smsBody", () => {
  it("fits one 160-character segment with the opt-out line", () => {
    const body = ReminderEngine.smsBody("Grace Church", "x".repeat(400));
    expect(body.length).toBeLessThanOrEqual(160);
    expect(body.startsWith("Grace Church: ")).toBe(true);
    expect(body.endsWith(" Reply STOP to opt out.")).toBe(true);
  });
});
