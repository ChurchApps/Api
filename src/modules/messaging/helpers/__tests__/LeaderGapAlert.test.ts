// Leader gap alert (plan-type reminder with recipientMode "leaderGaps"), driven through the real
// engine dispatcher and PlanReminderAdapter with the doing/membership gateways stubbed.
import type { NotificationHelper } from "../NotificationHelper.js";
import type { Repos } from "../../repositories/index.js";
import type { ReminderDefinition, ReminderOccurrence } from "../../models/index.js";

const createNotificationsMock: jest.MockedFunction<typeof NotificationHelper.createNotifications> = jest.fn();
jest.mock("../NotificationHelper.js", () => ({ NotificationHelper: { createNotifications: createNotificationsMock } }));

const loadGroupLeaderPersonIds = jest.fn(async (): Promise<string[]> => ["L1", "L2", "L1"]);
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch: async () => ({ timeZone: "UTC" }), loadGroupLeaderPersonIds }) }));

const loadPlanGapSummary = jest.fn(async (): Promise<string | null> => null);
const buildPlanGapEmails = jest.fn(async (_c: string, _p: string, ids: string[]) => Object.fromEntries(ids.map((id) => [id, { subject: "Scheduling gaps: Sunday", html: "<p>gaps</p>" }])));
const buildPlanReminderEmails = jest.fn(async () => ({}));
jest.mock("../../../../shared/modules/DoingModuleGateway.js", () => ({ getDoingModuleGateway: () => ({ loadPlanGapSummary, buildPlanGapEmails, buildPlanReminderEmails }) }));

const plan = { id: "PL1", churchId: "CH1", ministryId: "MIN1", name: "Sunday", serviceDate: new Date("2026-12-06T00:00:00Z") };
const loadForReminder = jest.fn(async () => [{ personId: "V1" }]);
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: async () => ({ plan: { load: async () => plan }, assignment: { loadForReminder } }) } }));

import { ReminderEngine } from "../ReminderEngine.js";
import { ReminderAdapterRegistry } from "../ReminderAdapter.js";
import { PlanReminderAdapter, LEADER_GAPS_MODE } from "../adapters/PlanReminderAdapter.js";

const occ: ReminderOccurrence = {
  id: "O1",
  churchId: "CH1",
  definitionId: "D1",
  entityType: "plan",
  entityId: "PL1",
  category: "serving_schedule",
  message: null,
  occLocalISO: "2026-12-06T09:00:00"
};

function buildRepos(def: ReminderDefinition, sent: string[] = []) {
  return {
    reminderOccurrence: {
      loadDue: jest.fn(async (): Promise<ReminderOccurrence[]> => [occ]),
      claim: jest.fn(async () => true),
      markSent: jest.fn(async () => {}),
      markCancelled: jest.fn(async () => {}),
      markFailed: jest.fn(async () => {}),
      markRetry: jest.fn(async () => {})
    },
    reminderDefinition: { load: jest.fn(async () => def) },
    reminderSentLog: {
      loadPersonIdsForOccurrence: jest.fn(async (): Promise<string[]> => sent),
      insertIgnore: jest.fn(async () => {})
    }
  };
}

const gapDef: ReminderDefinition = { id: "D1", churchId: "CH1", enabled: true, recipientMode: LEADER_GAPS_MODE, channels: "push,email" };

beforeAll(() => ReminderAdapterRegistry.register(PlanReminderAdapter));
beforeEach(() => {
  createNotificationsMock.mockReset().mockResolvedValue([]);
  loadPlanGapSummary.mockReset().mockResolvedValue(null);
  loadGroupLeaderPersonIds.mockClear();
  buildPlanGapEmails.mockClear();
  buildPlanReminderEmails.mockClear();
});

describe("leader gap alert", () => {
  it("sends nothing when the plan has no gaps", async () => {
    const repos = buildRepos(gapDef);
    ReminderEngine.init(repos as unknown as Repos);
    await ReminderEngine.scan();
    expect(createNotificationsMock).not.toHaveBeenCalled();
    expect(loadGroupLeaderPersonIds).not.toHaveBeenCalled();
    expect(repos.reminderOccurrence.markSent).toHaveBeenCalledWith("O1", 0);
  });

  it("sends one message to the ministry's leaders listing the gaps, with a link to the plan", async () => {
    loadPlanGapSummary.mockResolvedValue("Scheduling gaps for Sunday. Unfilled: Drums. Unconfirmed: Ann Lee");
    const repos = buildRepos(gapDef);
    ReminderEngine.init(repos as unknown as Repos);
    await ReminderEngine.scan();

    expect(loadGroupLeaderPersonIds).toHaveBeenCalledWith("CH1", "MIN1");
    expect(createNotificationsMock).toHaveBeenCalledTimes(1);
    const call = createNotificationsMock.mock.calls[0];
    expect(call[0]).toEqual(["L1", "L2"]);
    expect(call[1]).toBe("CH1");
    expect(call[3]).toBe("PL1");
    expect(call[4]).toBe("Scheduling gaps for Sunday. Unfilled: Drums. Unconfirmed: Ann Lee");
    expect(call[5]).toBe("/mobile/plans/PL1");
    expect(buildPlanGapEmails).toHaveBeenCalledWith("CH1", "PL1", ["L1", "L2"]);
    expect(buildPlanReminderEmails).not.toHaveBeenCalled();
    expect(call[7]?.emailByPerson?.L1?.subject).toBe("Scheduling gaps: Sunday");
    expect(repos.reminderSentLog.insertIgnore).toHaveBeenCalledTimes(2);
  });

  it("is not sent twice for the same plan and reminder", async () => {
    loadPlanGapSummary.mockResolvedValue("Scheduling gaps for Sunday. Unfilled: Drums");
    ReminderEngine.init(buildRepos(gapDef, ["L1", "L2"]) as unknown as Repos);
    await ReminderEngine.scan();
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the plan has no ministry to take leaders from", async () => {
    loadPlanGapSummary.mockResolvedValue("Scheduling gaps for Sunday. Unfilled: Drums");
    const recipients = await PlanReminderAdapter.loadRecipients("CH1", { ...plan, ministryId: undefined }, "", LEADER_GAPS_MODE);
    expect(recipients).toEqual([]);
  });

  it("is off by default: a volunteer reminder never reaches leaders", async () => {
    loadPlanGapSummary.mockResolvedValue("Scheduling gaps for Sunday. Unfilled: Drums");
    ReminderEngine.init(buildRepos({ ...gapDef, recipientMode: "assignments" }) as unknown as Repos);
    await ReminderEngine.scan();
    expect(loadGroupLeaderPersonIds).not.toHaveBeenCalled();
    expect(loadPlanGapSummary).not.toHaveBeenCalled();
    expect(createNotificationsMock.mock.calls[0][0]).toEqual(["V1"]);
    expect(createNotificationsMock.mock.calls[0][4]).toBe("Reminder: you're serving at Sunday");
  });
});
