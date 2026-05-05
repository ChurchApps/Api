/**
 * Server escalation contract test for the consolidated push fallback path.
 *
 * Asserts the chain that the closed-PWA scenario depends on:
 *   1. Recipient has no live socket connections in their "alerts" room.
 *   2. Recipient has a Device row whose `fcmToken` starts with `webpush:`.
 *   3. NotificationHelper.attemptDeliveryWithEscalation falls through socket,
 *      reaches the push level, and calls WebPushHelper.sendBulkTypedMessages
 *      with the right tokens / payload.
 *
 * web-push and the messaging repos are mocked so this test runs without a
 * real DB or push service.
 */

// Mock the WebPushHelper used inside NotificationHelper. We assert it gets called
// with the encoded subscription string (and the right title/body/type/contentId).
const sendBulkTypedMessagesMock = jest.fn() as jest.MockedFunction<any>;
sendBulkTypedMessagesMock.mockResolvedValue([{ token: "webpush:fake", success: true, gone: false }]);

jest.mock("../WebPushHelper.js", () => ({
  WebPushHelper: {
    sendBulkTypedMessages: sendBulkTypedMessagesMock,
    isWebPushToken: (t?: string) => !!t && t.startsWith("webpush:")
  }
}));

// ExpoPushHelper might be invoked too; provide a no-op so the test doesn't
// accidentally exercise expo-server-sdk.
jest.mock("../ExpoPushHelper.js", () => ({ ExpoPushHelper: { sendBulkTypedMessages: jest.fn().mockResolvedValue([]) } }));

// DeliveryHelper.sendMessages is only called on the socket path; we assert it
// is NOT called in this test (recipient is offline).
const sendMessagesMock = jest.fn() as jest.MockedFunction<any>;
sendMessagesMock.mockResolvedValue(0);
jest.mock("../DeliveryHelper.js", () => ({ DeliveryHelper: { sendMessages: sendMessagesMock } }));

// @churchapps/apihelper is ESM-only and breaks Jest's CommonJS loader. Mock it
// since our paths under test don't use ArrayHelper or EmailHelper.
jest.mock("@churchapps/apihelper", () => ({
  ArrayHelper: { getIds: jest.fn(() => []), getAll: jest.fn(() => []), getOne: jest.fn(() => null) },
  EmailHelper: { sendEmail: jest.fn().mockResolvedValue(undefined) }
}));

// Environment uses import.meta.url which CommonJS-transformed Jest can't parse.
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { getEnvironmentName: () => "test" } }));

// axios is used elsewhere in NotificationHelper but not on the path under test.
jest.mock("axios", () => ({ default: { post: jest.fn() }, post: jest.fn() }));

import { NotificationHelper } from "../NotificationHelper.js";

describe("NotificationHelper.attemptDeliveryWithEscalation", () => {
  beforeEach(() => {
    sendBulkTypedMessagesMock.mockClear();
    sendMessagesMock.mockClear();
  });

  function buildRepos(opts: { connections?: any[]; devices?: any[]; pref?: any }) {
    return {
      connection: { loadForNotification: jest.fn(async () => opts.connections ?? []) },
      notification: { loadNewCounts: jest.fn(async () => ({ notificationCount: 1, pmCount: 0 })) },
      notificationPreference: { loadByPersonId: jest.fn(async () => opts.pref ?? { allowPush: true, emailFrequency: "individual" }) },
      device: {
        loadForPerson: jest.fn(async () => opts.devices ?? []),
        deleteByFcmToken: jest.fn(async () => {})
      },
      deliveryLog: { save: jest.fn(async () => ({})) }
    } as any;
  }

  it("escalates to web push when the recipient has no live socket", async () => {
    const repos = buildRepos({
      connections: [], // offline
      devices: [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }]
    });
    NotificationHelper.init(repos);

    const result = await NotificationHelper.attemptDeliveryWithEscalation(
      "CHU00000001",
      "PER00000001",
      0, // start at socket level
      "Title text",
      "Body text",
      "privateMessage",
      "PMID00001"
    );

    expect(sendMessagesMock).not.toHaveBeenCalled(); // socket path not invoked
    expect(sendBulkTypedMessagesMock).toHaveBeenCalledTimes(1);

    const args = sendBulkTypedMessagesMock.mock.calls[0];
    const tokens = args[0] as string[];
    expect(tokens).toHaveLength(1);
    expect(tokens[0].startsWith("webpush:")).toBe(true);
    expect(args[1]).toBe("Title text");
    expect(args[2]).toBe("Body text");
    expect(args[3]).toBe("privateMessage");
    expect(args[4]).toBe("PMID00001");

    expect(result).toBe("push");
  });

  it("delivers via socket when the recipient is online (push not invoked)", async () => {
    const repos = buildRepos({
      connections: [{ socketId: "abc", churchId: "CHU00000001" }],
      devices: [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }]
    });
    NotificationHelper.init(repos);

    const result = await NotificationHelper.attemptDeliveryWithEscalation(
      "CHU00000001",
      "PER00000001",
      0,
      "Title",
      "Body",
      "notification",
      "NID0001"
    );

    expect(sendMessagesMock).toHaveBeenCalledTimes(1);
    expect(sendBulkTypedMessagesMock).not.toHaveBeenCalled();
    expect(result).toBe("socket");
  });

  it("falls through to email when allowPush is false", async () => {
    const repos = buildRepos({
      connections: [],
      devices: [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }],
      pref: { allowPush: false, emailFrequency: "individual" }
    });
    NotificationHelper.init(repos);

    const result = await NotificationHelper.attemptDeliveryWithEscalation(
      "CHU00000001",
      "PER00000001",
      0,
      "Title",
      "Body",
      "notification",
      "NID0001"
    );

    expect(sendMessagesMock).not.toHaveBeenCalled();
    expect(sendBulkTypedMessagesMock).not.toHaveBeenCalled();
    expect(result).toBe("email");
  });
});
