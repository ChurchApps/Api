// Conversation cleanup moved off the request path (ConversationRepo.save) onto the 30-minute timer.
const cleanup = jest.fn().mockResolvedValue(undefined);
const jobNames: string[] = [];

jest.mock("../../shared/helpers/Environment.js", () => ({ Environment: { currentEnvironment: "test", init: jest.fn() } }));
jest.mock("../../shared/helpers/JobRunHelper.js", () => ({ JobRunHelper: { run: jest.fn(async (name: string, fn: () => Promise<unknown>) => { jobNames.push(name); if (name === "conversationCleanup") await fn(); }) } }));
jest.mock("../../modules/messaging/helpers/NotificationHelper.js", () => ({ NotificationHelper: { init: jest.fn() } }));
jest.mock("../../modules/bridge/helpers/AutomationHelper.js", () => ({ AutomationHelper: {} }));
jest.mock("../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ conversation: { cleanup } })) } }));

import { handle30MinTimer } from "../timer-handler";

describe("handle30MinTimer", () => {
  it("runs the conversation cleanup job", async () => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    await handle30MinTimer({} as any, {} as any);
    expect(jobNames).toContain("conversationCleanup");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
