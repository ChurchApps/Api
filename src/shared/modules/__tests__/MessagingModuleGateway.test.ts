const createNotificationsMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../modules/messaging/helpers/NotificationHelper.js", () => ({ NotificationHelper: { createNotifications: (...args: unknown[]) => createNotificationsMock(...args) } }));

const loadByIdMock = jest.fn();
jest.mock("../../infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ emailTemplate: { loadById: loadByIdMock } })) } }));

import { getMessagingModuleGateway } from "../MessagingModuleGateway.js";

describe("MessagingModuleGateway.sendTemplatedEmail", () => {
  beforeEach(() => {
    createNotificationsMock.mockClear();
    loadByIdMock.mockReset();
  });

  it("returns false without notifying when the recipient has no email", async () => {
    const result = await getMessagingModuleGateway().sendTemplatedEmail("c1", "p1", "t1", { email: "" } as any, "Church");
    expect(result).toBe(false);
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it("returns false without notifying when the template is missing", async () => {
    loadByIdMock.mockResolvedValue(null);
    const result = await getMessagingModuleGateway().sendTemplatedEmail("c1", "p1", "missing", { email: "a@b.com" }, "Church");
    expect(result).toBe(false);
    expect(createNotificationsMock).not.toHaveBeenCalled();
  });

  it("renders merge fields and routes the rendered email through NotificationHelper.createNotifications", async () => {
    loadByIdMock.mockResolvedValue({ subject: "Hi {{firstName}}", htmlContent: "<p>Welcome {{firstName}} to {{churchName}}</p>" });

    const result = await getMessagingModuleGateway().sendTemplatedEmail(
      "c1",
      "p1",
      "t1",
      { email: "pat@example.com", firstName: "Pat", displayName: "Pat Person" },
      "Grace Church"
    );

    expect(result).toBe(true);
    expect(createNotificationsMock).toHaveBeenCalledTimes(1);
    const [
      personIds,
      churchId,
      contentType,
      contentId,
      message,
      link,
      triggeredBy,
      options
    ] = createNotificationsMock.mock.calls[0];
    expect(personIds).toEqual(["p1"]);
    expect(churchId).toBe("c1");
    expect(contentType).toBe("task");
    expect(contentId).toBe("t1");
    expect(message).toBe("Hi Pat");
    expect(link).toBeUndefined();
    expect(triggeredBy).toBeUndefined();
    expect(options).toMatchObject({ category: "announcements", deliveryStartLevel: 2, emailImmediate: true });
    expect(options.emailByPerson.p1).toEqual({ subject: "Hi Pat", html: "<p>Welcome Pat to Grace Church</p>" });
  });

  it("uses subjectOverride instead of the template's saved subject when provided", async () => {
    loadByIdMock.mockResolvedValue({ subject: "Default subject", htmlContent: "<p>Body</p>" });

    await getMessagingModuleGateway().sendTemplatedEmail("c1", "p1", "t1", { email: "pat@example.com" }, "Grace Church", "Custom subject");

    const options = createNotificationsMock.mock.calls[0][7];
    expect(options.emailByPerson.p1.subject).toBe("Custom subject");
  });
});
