const createNotificationsMock = jest.fn().mockResolvedValue(undefined);

let groupsFixture: any[] = [];
let eventsFixture: any[] = [];
let sessionsResult: any[] = [];

jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadChurch: async () => ({ subDomain: "demo" }) }),
  getMessagingModuleGateway: () => ({ createNotifications: createNotificationsMock }),
  getDoingModuleGateway: () => ({})
}));

jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({
  RepoManager: {
    getRepos: jest.fn((moduleName: string) => {
      if (moduleName === "membership") {
        return {
          group: { loadAttendanceReminderGroups: async () => groupsFixture },
          groupMember: { loadLeadersForGroup: async () => [{ personId: "PER1" }] }
        };
      }
      if (moduleName === "content") {
        return { event: { loadForGroup: async () => eventsFixture } };
      }
      return {};
    })
  }
}));

jest.mock("../../../../shared/infrastructure/KyselyPool.js", () => ({
  KyselyPool: {
    getDb: () => {
      const builder: any = {};
      builder.selectFrom = () => builder;
      builder.select = () => builder;
      builder.where = () => builder;
      builder.execute = async () => sessionsResult;
      return builder;
    }
  }
}));

jest.mock("../../../content/helpers/CalendarHelper.js", () => ({ CalendarHelper: { addExceptionDates: async () => {} } }));

import { AutomationHelper } from "../AutomationHelper.js";

const yesterday = new Date();
yesterday.setHours(0, 0, 0, 0);
yesterday.setDate(yesterday.getDate() - 1);

function makeYesterdayEvent() {
  const start = new Date(yesterday);
  start.setHours(10, 0, 0, 0);
  const end = new Date(yesterday);
  end.setHours(11, 0, 0, 0);
  return { id: "EVT1", churchId: "CHU1", start, end };
}

describe("AutomationHelper.remindGroupAttendance", () => {
  beforeEach(() => {
    createNotificationsMock.mockClear();
    groupsFixture = [{ id: "GRP1", churchId: "CHU1", name: "Sample Group" }];
    eventsFixture = [makeYesterdayEvent()];
    sessionsResult = [];
    (AutomationHelper as any).subdomainCache = {};
  });

  it("returns 1 and calls createNotifications when event occurred but no session exists", async () => {
    sessionsResult = [];
    const count = await AutomationHelper.remindGroupAttendance();
    expect(count).toBe(1);
    expect(createNotificationsMock).toHaveBeenCalledTimes(1);
    const notifications = createNotificationsMock.mock.calls[0][0];
    expect(notifications).toHaveLength(1);
    expect(notifications[0].personId).toBe("PER1");
    expect(notifications[0].churchId).toBe("CHU1");
  });

  it("returns 0 and does not call createNotifications when a session already exists", async () => {
    sessionsResult = [{ id: "S1" }];
    const count = await AutomationHelper.remindGroupAttendance();
    expect(count).toBe(0);
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it("returns 0 and does not call createNotifications when no groups have reminders enabled", async () => {
    groupsFixture = [];
    const count = await AutomationHelper.remindGroupAttendance();
    expect(count).toBe(0);
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });
});
