const sendNotificationMock = jest.fn() as jest.MockedFunction<any>;
const setVapidDetailsMock = jest.fn() as jest.MockedFunction<any>;

jest.mock("web-push", () => ({
  __esModule: true,
  default: {
    sendNotification: sendNotificationMock,
    setVapidDetails: setVapidDetailsMock
  }
}));

jest.mock("../../../../shared/helpers/Environment.js", () => ({
  Environment: {
    webPushPublicKey: "public-key",
    webPushPrivateKey: "private-key",
    webPushSubject: "mailto:test@example.com"
  }
}));

import { WebPushHelper, WEB_PUSH_PREFIX } from "../WebPushHelper.js";

describe("WebPushHelper", () => {
  beforeEach(() => {
    sendNotificationMock.mockReset();
    setVapidDetailsMock.mockReset();
  });

  it("classifies 410 responses as gone subscriptions", async () => {
    sendNotificationMock.mockRejectedValueOnce({
      statusCode: 410,
      body: "Gone"
    });

    const token = WEB_PUSH_PREFIX + JSON.stringify({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      keys: { p256dh: "p-key", auth: "a-key" }
    });

    const [result] = await WebPushHelper.sendBulkTypedMessages([token], "Title", "Body", "notification", "N1");

    expect(setVapidDetailsMock).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.gone).toBe(true);
    expect(result.retryable).toBe(false);
    expect(result.diagnosticCode).toBe("subscription-gone");
    expect(result.endpointHost).toBe("fcm.googleapis.com");
  });

  it("classifies 403 responses as VAPID mismatch/auth failures", async () => {
    sendNotificationMock.mockRejectedValueOnce({
      statusCode: 403,
      body: "Forbidden"
    });

    const token = WEB_PUSH_PREFIX + JSON.stringify({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      keys: { p256dh: "p-key", auth: "a-key" }
    });

    const [result] = await WebPushHelper.sendBulkTypedMessages([token], "Title", "Body", "notification", "N1");

    expect(result.success).toBe(false);
    expect(result.gone).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(result.diagnosticCode).toBe("vapid-auth-failed");
  });

  it("classifies 503 responses as retryable provider failures", async () => {
    sendNotificationMock.mockRejectedValueOnce({
      statusCode: 503,
      body: "Temporary failure"
    });

    const token = WEB_PUSH_PREFIX + JSON.stringify({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      keys: { p256dh: "p-key", auth: "a-key" }
    });

    const [result] = await WebPushHelper.sendBulkTypedMessages([token], "Title", "Body", "notification", "N1");

    expect(result.success).toBe(false);
    expect(result.gone).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.statusCode).toBe(503);
    expect(result.diagnosticCode).toBe("push-provider-server-error");
  });
});
