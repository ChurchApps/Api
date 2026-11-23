// Conversation cleanup moved off the request path (ConversationRepo.save) onto the 30-minute timer.
const cleanup = jest.fn().mockResolvedValue(undefined);
const jobNames: string[] = [];

jest.mock("../../shared/helpers/Environment.js", () => ({ Environment: { currentEnvironment: "test", init: jest.fn() } }));
jest.mock("../../shared/helpers/JobRunHelper.js", () => ({ JobRunHelper: { run: jest.fn(async (name: string, fn: () => Promise<unknown>) => { jobNames.push(name); if (name === "conversationCleanup") await fn(); }) } }));
jest.mock("../../modules/messaging/helpers/NotificationHelper.js", () => ({ NotificationHelper: { init: jest.fn() } }));
jest.mock("../../modules/messaging/index.js", () => ({ initializeNotificationDelivery: jest.fn() }));
jest.mock("../../modules/bridge/helpers/AutomationHelper.js", () => ({ AutomationHelper: {} }));
jest.mock("../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ conversation: { cleanup } })) } }));

import { ScheduledEvent, Context } from "aws-lambda";
import { handle30MinTimer } from "../timer-handler.js";

describe("handle30MinTimer", () => {
  it("runs the conversation cleanup job", async () => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    await handle30MinTimer({} as ScheduledEvent, {} as Context);
    expect(jobNames).toContain("conversationCleanup");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("resumes waiting workflow cards every 30 minutes, not once a day", async () => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    await handle30MinTimer({} as ScheduledEvent, {} as Context);
    expect(jobNames).toContain("workflowSnoozed");
  });

  // Birthday and anniversary rules run just after each church's local midnight (ChurchAppsSupport#1656).
  it("runs scheduled workflow rules every 30 minutes", async () => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    await handle30MinTimer({} as ScheduledEvent, {} as Context);
    expect(jobNames).toContain("scheduledRules");
  });
});
