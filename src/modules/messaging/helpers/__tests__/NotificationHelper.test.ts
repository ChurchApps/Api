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
sendBulkTypedMessagesMock.mockResolvedValue([{ token: "webpush:fake", success: true, gone: false, retryable: false }]);

jest.mock("../WebPushHelper.js", () => ({
  WebPushHelper: {
    sendBulkTypedMessages: sendBulkTypedMessagesMock,
    isWebPushToken: (t?: string) => !!t && t.startsWith("webpush:"),
    getEndpointFromToken: (t?: string) => {
      if (!t || !t.startsWith("webpush:")) return null;
      const parsed = JSON.parse(t.substring("webpush:".length));
      return parsed?.endpoint || null;
    },
    getConfigSummary: () => ({ instanceId: "test-instance" }),
    getEndpointSummary: () => ({ endpointHost: "example.com" })
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
const sendTemplatedEmailMock = jest.fn() as jest.MockedFunction<any>;
sendTemplatedEmailMock.mockResolvedValue(undefined);
jest.mock("@churchapps/apihelper", () => ({
  ArrayHelper: { getIds: jest.fn(() => []), getAll: jest.fn(() => []), getOne: jest.fn(() => null) },
  EmailHelper: { sendEmail: jest.fn().mockResolvedValue(undefined), sendTemplatedEmail: sendTemplatedEmailMock }
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
    sendBulkTypedMessagesMock.mockResolvedValue([{ token: "webpush:fake", success: true, gone: false, retryable: false }]);
    sendMessagesMock.mockResolvedValue(0);
  });

  function buildRepos(opts: { connections?: any[]; devices?: any[]; pref?: any }) {
    return {
      connection: { loadForNotification: jest.fn(async () => opts.connections ?? []) },
      notification: { loadNewCounts: jest.fn(async () => ({ notificationCount: 1, pmCount: 0 })) },
      notificationPreference: { loadByPersonId: jest.fn(async () => opts.pref ?? { allowPush: true, emailFrequency: "individual" }) },
      notificationPreferenceOverride: { loadForPerson: jest.fn(async () => []) },
      notificationEntityMute: { loadForPerson: jest.fn(async () => []) },
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
    sendMessagesMock.mockResolvedValueOnce(1);

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

  it("keeps the item on the push track when the web push provider fails transiently", async () => {
    sendBulkTypedMessagesMock.mockResolvedValueOnce([
      {
        token: "webpush:fake",
        success: false,
        gone: false,
        retryable: true,
        diagnosticCode: "push-provider-server-error",
        statusCode: 503,
        errorMessage: "temporary upstream failure"
      }
    ]);

    const repos = buildRepos({
      connections: [],
      devices: [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }]
    });
    NotificationHelper.init(repos);

    const result = await NotificationHelper.attemptDeliveryWithEscalation(
      "CHU00000001",
      "PER00000001",
      0,
      "Title text",
      "Body text",
      "privateMessage",
      "PMID00001"
    );

    expect(sendBulkTypedMessagesMock).toHaveBeenCalledTimes(1);
    expect(result).toBe("push");
  });
});

describe("NotificationHelper.checkShouldNotify privateMessage", () => {
  beforeEach(() => {
    sendBulkTypedMessagesMock.mockClear();
    sendMessagesMock.mockClear();
  });

  function buildPrivateMessageRepos(privateMessage: any, opts: { connections?: any[]; devices?: any[]; pref?: any; overrides?: any[]; existingDm?: any[] } = {}) {
    const savedNotifications: any[] = [];
    return {
      privateMessage: {
        loadByConversationId: jest.fn(async () => ({ ...privateMessage })),
        save: jest.fn(async (pm) => pm)
      },
      message: { loadForConversation: jest.fn(async () => []) },
      connection: { loadForNotification: jest.fn(async () => opts.connections ?? []) },
      notification: {
        loadNewCounts: jest.fn(async () => ({ notificationCount: 0, pmCount: 1 })),
        loadExistingUnread: jest.fn(async () => opts.existingDm ?? savedNotifications.filter((n) => n.contentType === "privateMessage" && n.isNew)),
        save: jest.fn(async (n) => {
          if (n.id) {
            const existing = savedNotifications.find((s) => s.id === n.id);
            if (existing) Object.assign(existing, n);
            return n;
          }
          const row = { ...n, id: `NDM_${savedNotifications.length + 1}` };
          savedNotifications.push(row);
          return row;
        })
      },
      notificationPreference: { loadByPersonId: jest.fn(async () => opts.pref ?? { allowPush: true, emailFrequency: "individual" }) },
      notificationPreferenceOverride: { loadForPerson: jest.fn(async () => opts.overrides ?? []) },
      notificationEntityMute: { loadForPerson: jest.fn(async () => []) },
      device: {
        loadForPerson: jest.fn(async () => opts.devices ?? [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }]),
        deleteByFcmToken: jest.fn(async () => {})
      },
      deliveryLog: { save: jest.fn(async () => ({})) }
    } as any;
  }

  it("notifies only the other participant when the sender is resolved", async () => {
    const repos = buildPrivateMessageRepos({
      id: "PM1",
      churchId: "CHU1",
      conversationId: "CONV1",
      fromPersonId: "PER_A",
      toPersonId: "PER_B"
    });
    NotificationHelper.init(repos);

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as any,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Hello" } as any,
      "PER_A"
    );

    expect(repos.privateMessage.save).toHaveBeenCalled();
    const saved = repos.privateMessage.save.mock.calls.at(-1)?.[0];
    expect(saved.notifyPersonId).toBe("PER_B");
    expect(sendBulkTypedMessagesMock).toHaveBeenCalledTimes(1);
  });

  it("creates a privateMessage notification row for the recipient that stays escalatable", async () => {
    // Online recipient (socket), no push devices: the delivery records "socket"
    // rather than early-returning, so the timer can escalate it while unread.
    sendMessagesMock.mockResolvedValueOnce(1);
    const repos = buildPrivateMessageRepos(
      { id: "PM1", churchId: "CHU1", conversationId: "CONV1", fromPersonId: "PER_A", toPersonId: "PER_B" },
      { connections: [{ socketId: "s1", churchId: "CHU1" }], devices: [] }
    );
    NotificationHelper.init(repos);

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as any,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Hello" } as any,
      "PER_A"
    );

    expect(sendMessagesMock).toHaveBeenCalledTimes(1); // socket delivered
    const created = repos.notification.save.mock.calls[0]?.[0];
    expect(created.contentType).toBe("privateMessage");
    expect(created.personId).toBe("PER_B");
    expect(created.category).toBe("direct_messages");
    expect(created.contentId).toBe("PM1");
    const finalSave = repos.notification.save.mock.calls.at(-1)?.[0];
    expect(finalSave.deliveryMethod).toBe("socket");
    expect(finalSave.isNew).not.toBe(false);
  });

  it("delivers every consecutive message over the socket (no unread-dedup swallow)", async () => {
    sendMessagesMock.mockResolvedValue(1);
    const repos = buildPrivateMessageRepos(
      { id: "PM1", churchId: "CHU1", conversationId: "CONV1", fromPersonId: "PER_A", toPersonId: "PER_B" },
      { connections: [{ socketId: "s1", churchId: "CHU1" }], devices: [] }
    );
    NotificationHelper.init(repos);

    const conv = { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as any;
    await NotificationHelper.checkShouldNotify(conv, { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "One" } as any, "PER_A");
    await NotificationHelper.checkShouldNotify(conv, { id: "MSG2", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Two" } as any, "PER_A");

    expect(sendMessagesMock).toHaveBeenCalledTimes(2); // both pinged the socket
    // Reuse: the second message shares the conversation's existing unread row.
    const createCalls = repos.notification.save.mock.calls.filter((c: any[]) => !c[0].id).length;
    expect(createCalls).toBe(1);
  });

  it("suppresses notification when the sender is not one of the conversation participants", async () => {
    const repos = buildPrivateMessageRepos({
      id: "PM1",
      churchId: "CHU1",
      conversationId: "CONV1",
      fromPersonId: "PER_A",
      toPersonId: "PER_B"
    });
    NotificationHelper.init(repos);

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as any,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "Unknown", content: "Hello" } as any,
      "anonymous"
    );

    expect(sendBulkTypedMessagesMock).not.toHaveBeenCalled();
    const saved = repos.privateMessage.save.mock.calls.at(-1)?.[0];
    expect(saved.notifyPersonId).toBeNull();
  });

  it("mute-parks a direct message when the in_app channel is suppressed (masterMute)", async () => {
    const repos = buildPrivateMessageRepos(
      { id: "PM1", churchId: "CHU1", conversationId: "CONV1", fromPersonId: "PER_A", toPersonId: "PER_B" },
      { connections: [{ socketId: "s1", churchId: "CHU1" }], pref: { allowPush: true, emailFrequency: "individual", masterMute: true } }
    );
    NotificationHelper.init(repos);

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as any,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Hello" } as any,
      "PER_A"
    );

    expect(sendMessagesMock).not.toHaveBeenCalled(); // no socket ping
    expect(sendBulkTypedMessagesMock).not.toHaveBeenCalled(); // no push
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled(); // no email
    const finalNotif = repos.notification.save.mock.calls.at(-1)?.[0];
    expect(finalNotif.deliveryMethod).toBe("muted");
    expect(finalNotif.isNew).toBe(false);
    // Badge (pmCount) dropped: notifyPersonId cleared.
    const finalPm = repos.privateMessage.save.mock.calls.at(-1)?.[0];
    expect(finalPm.notifyPersonId).toBeNull();
  });

  it("delivers a direct message normally when in_app is allowed (default prefs)", async () => {
    sendMessagesMock.mockResolvedValueOnce(1);
    const repos = buildPrivateMessageRepos(
      { id: "PM1", churchId: "CHU1", conversationId: "CONV1", fromPersonId: "PER_A", toPersonId: "PER_B" },
      { connections: [{ socketId: "s1", churchId: "CHU1" }], devices: [] }
    );
    NotificationHelper.init(repos);

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as any,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Hello" } as any,
      "PER_A"
    );

    expect(sendMessagesMock).toHaveBeenCalledTimes(1);
    const payload = sendMessagesMock.mock.calls[0][1];
    expect(payload.action).toBe("privateMessage");
    expect(payload.conversationId).toBe("CONV1");
    const finalNotif = repos.notification.save.mock.calls.at(-1)?.[0];
    expect(finalNotif.deliveryMethod).toBe("socket");
  });
});

describe("NotificationHelper.escalateDelivery direct messages", () => {
  beforeEach(() => {
    sendBulkTypedMessagesMock.mockClear();
    sendMessagesMock.mockClear();
    sendBulkTypedMessagesMock.mockResolvedValue([{ token: "webpush:fake", success: true, gone: false, retryable: false }]);
  });

  it("escalates an unread DM notification row to push without touching the PM table", async () => {
    const saved: any[] = [];
    const repos = {
      notification: {
        loadPendingEscalation: jest.fn(async () => [
          {
            id: "NDM1",
            churchId: "CHU1",
            personId: "PER_B",
            contentType: "privateMessage",
            contentId: "PM1",
            message: "New Message from User A",
            triggeredByPersonId: "PER_A",
            deliveryMethod: "socket",
            category: "direct_messages",
            isNew: true
          }
        ]),
        loadNewCounts: jest.fn(async () => ({ notificationCount: 0, pmCount: 1 })),
        save: jest.fn(async (n) => { saved.push(n); return n; })
      },
      connection: { loadForNotification: jest.fn(async () => []) },
      notificationPreference: { loadByPersonId: jest.fn(async () => ({ allowPush: true, emailFrequency: "individual" })) },
      notificationPreferenceOverride: { loadForPerson: jest.fn(async () => []) },
      notificationEntityMute: { loadForPerson: jest.fn(async () => []) },
      device: { loadForPerson: jest.fn(async () => [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }]), deleteByFcmToken: jest.fn(async () => {}) },
      deliveryLog: { save: jest.fn(async () => ({})) }
      // no privateMessage repo — escalation must not reach for it
    } as any;
    NotificationHelper.init(repos);

    const result = await NotificationHelper.escalateDelivery();

    expect(sendBulkTypedMessagesMock).toHaveBeenCalledTimes(1);
    const args = sendBulkTypedMessagesMock.mock.calls[0];
    expect(args[3]).toBe("privateMessage"); // push carries the DM type
    expect(args[4]).toBe("PM1");
    expect(saved.at(-1)?.deliveryMethod).toBe("push");
    expect(result.notificationsEscalated).toBe(1);
    expect((result as any).pmsEscalated).toBeUndefined();
  });
});

describe("NotificationHelper.sendEmailNotifications direct messages", () => {
  const apihelper = jest.requireMock("@churchapps/apihelper") as any;

  beforeEach(() => {
    sendTemplatedEmailMock.mockClear();
    sendTemplatedEmailMock.mockResolvedValue(undefined);
    apihelper.ArrayHelper.getIds.mockImplementation((arr: any[], field: string) => [...new Set((arr || []).map((a) => a[field]).filter(Boolean))]);
    apihelper.ArrayHelper.getAll.mockImplementation((arr: any[], field: string, value: any) => (arr || []).filter((a) => a[field] === value));
    apihelper.ArrayHelper.getOne.mockImplementation((arr: any[], field: string, value: any) => (arr || []).find((a) => a[field] === value) || null);
  });

  afterEach(() => {
    apihelper.ArrayHelper.getIds.mockReset();
    apihelper.ArrayHelper.getAll.mockReset();
    apihelper.ArrayHelper.getOne.mockReset();
    apihelper.ArrayHelper.getIds.mockImplementation(() => []);
    apihelper.ArrayHelper.getAll.mockImplementation(() => []);
    apihelper.ArrayHelper.getOne.mockImplementation(() => null);
  });

  it("renders a DM digest email from notification rows and never loads PM rows", async () => {
    const savedComplete: any[] = [];
    const repos = {
      notification: {
        loadUndelivered: jest.fn(async () => [
          {
            id: "NDM1",
            churchId: "CHU1",
            personId: "PER_B",
            contentType: "privateMessage",
            contentId: "PM1",
            message: "New Message from Jane Doe",
            triggeredByPersonId: "PER_A",
            deliveryMethod: "email",
            category: "direct_messages"
          }
        ]),
        save: jest.fn(async (n) => { savedComplete.push(n); return n; })
      },
      notificationPreference: { loadByPersonIds: jest.fn(async () => [{ personId: "PER_B", churchId: "CHU1", emailFrequency: "individual" }]) },
      notificationPreferenceOverride: { loadByPersonIds: jest.fn(async () => []) },
      deliveryLog: { save: jest.fn(async () => ({})) }
      // no privateMessage repo — the digest must not touch PM rows
    } as any;
    NotificationHelper.init(repos);
    const spy = jest.spyOn(NotificationHelper, "getEmailData").mockResolvedValue([
      { id: "PER_B", email: "recipient@example.com" },
      { id: "PER_A", email: "sender@example.com" }
    ] as any);

    const result = await NotificationHelper.sendEmailNotifications("individual");

    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1);
    const args = sendTemplatedEmailMock.mock.calls[0];
    expect(args[4]).toBe("New Message from Jane Doe"); // subject
    expect(args[7]).toBe("sender@example.com"); // reply-to
    expect(savedComplete.at(-1)?.deliveryMethod).toBe("complete");
    expect((result as any).pmsProcessed).toBeUndefined();
    spy.mockRestore();
  });
});

describe("NotificationHelper.createNotifications emailImmediate", () => {
  function buildRepos(opts: { pref?: any; existing?: any[] } = {}) {
    return {
      notification: {
        loadExistingUnread: jest.fn(async () => opts.existing ?? []),
        loadNewCounts: jest.fn(async () => ({ notificationCount: 0, pmCount: 0 })),
        save: jest.fn(async (n: any) => ({ ...n, id: n.id || `NOTIF_${n.personId}` }))
      },
      connection: { loadForNotification: jest.fn(async () => []) },
      notificationPreference: { loadByPersonId: jest.fn(async () => opts.pref ?? { allowPush: true, emailFrequency: "individual" }) },
      notificationPreferenceOverride: { loadForPerson: jest.fn(async () => []) },
      notificationEntityMute: { loadForPerson: jest.fn(async () => []) },
      device: { loadForPerson: jest.fn(async () => []), deleteByFcmToken: jest.fn(async () => {}) },
      deliveryLog: { save: jest.fn(async () => ({})) }
    } as any;
  }

  let getEmailDataSpy: jest.SpyInstance;

  beforeEach(() => {
    sendTemplatedEmailMock.mockClear();
    sendTemplatedEmailMock.mockResolvedValue(undefined);
    getEmailDataSpy = jest.spyOn(NotificationHelper, "getEmailData");
  });

  afterEach(() => {
    getEmailDataSpy.mockRestore();
  });

  it("sends the per-recipient rich email, logs delivery, and marks the row complete when the gate allows", async () => {
    const repos = buildRepos();
    NotificationHelper.init(repos);
    getEmailDataSpy.mockResolvedValue([{ id: "PER1", email: "per1@example.com" }]);

    const result = await NotificationHelper.createNotifications(
      ["PER1"],
      "CHU1",
      "event",
      "EVT1",
      "Reminder message",
      "https://b1.church/event/1",
      undefined,
      { category: "event_reminders", deliveryStartLevel: 1, emailImmediate: true, emailByPerson: { PER1: { subject: "Custom subject", html: "<p>Custom html</p>" } } }
    );

    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1);
    const args = sendTemplatedEmailMock.mock.calls[0];
    expect(args[1]).toBe("per1@example.com");
    expect(args[4]).toBe("Custom subject");
    expect(args[5]).toBe("<p>Custom html</p>");
    expect(repos.deliveryLog.save).toHaveBeenCalledWith(expect.objectContaining({ deliveryMethod: "email", success: true, personId: "PER1" }));
    expect(result[0].deliveryMethod).toBe("complete");
  });

  it("bypasses the unread-dedup guard so an unread earlier row does not swallow an explicit send", async () => {
    const repos = buildRepos({ existing: [{ personId: "PER1" }] });
    NotificationHelper.init(repos);
    getEmailDataSpy.mockResolvedValue([{ id: "PER1", email: "per1@example.com" }]);

    const result = await NotificationHelper.createNotifications(
      ["PER1"],
      "CHU1",
      "assignment",
      "PLA1",
      "Second offset reminder",
      undefined,
      undefined,
      { category: "serving_schedule", deliveryStartLevel: 1, emailImmediate: true }
    );

    expect(repos.notification.loadExistingUnread).not.toHaveBeenCalled();
    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it("suppresses the send when the gate denies (masterMute) but still persists the row as complete", async () => {
    const repos = buildRepos({ pref: { allowPush: true, emailFrequency: "individual", masterMute: true } });
    NotificationHelper.init(repos);
    getEmailDataSpy.mockResolvedValue([{ id: "PER1", email: "per1@example.com" }]);

    const result = await NotificationHelper.createNotifications(
      ["PER1"],
      "CHU1",
      "event",
      "EVT1",
      "Reminder message",
      undefined,
      undefined,
      { category: "event_reminders", deliveryStartLevel: 1, emailImmediate: true }
    );

    expect(sendTemplatedEmailMock).not.toHaveBeenCalled();
    expect(result[0].deliveryMethod).toBe("complete");
  });

  it("falls back to generic subject/body when emailByPerson has no entry for the recipient", async () => {
    const repos = buildRepos();
    NotificationHelper.init(repos);
    getEmailDataSpy.mockResolvedValue([{ id: "PER1", email: "per1@example.com" }]);

    await NotificationHelper.createNotifications(
      ["PER1"],
      "CHU1",
      "event",
      "EVT1",
      "Reminder message",
      "https://b1.church/event/1",
      undefined,
      { category: "event_reminders", deliveryStartLevel: 1, emailImmediate: true, emailByPerson: { OTHER_PERSON: { subject: "x", html: "y" } } }
    );

    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1);
    const args = sendTemplatedEmailMock.mock.calls[0];
    expect(args[4]).toBe("Reminder message");
    expect(args[5]).toContain("Reminder message");
    expect(args[5]).toContain("https://b1.church/event/1");
  });

  it("leaves the row in its normal escalation state when the recipient has no email address on file", async () => {
    const repos = buildRepos();
    NotificationHelper.init(repos);
    getEmailDataSpy.mockResolvedValue([]);

    const result = await NotificationHelper.createNotifications(
      ["PER1"],
      "CHU1",
      "event",
      "EVT1",
      "Reminder message",
      undefined,
      undefined,
      { category: "event_reminders", deliveryStartLevel: 1, emailImmediate: true }
    );

    expect(sendTemplatedEmailMock).not.toHaveBeenCalled();
    expect(result[0].deliveryMethod).not.toBe("complete");
  });
});
