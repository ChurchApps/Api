// Contract test for socket→push escalation when recipient offline with webpush device.
// Mocks WebPushHelper, ExpoPushHelper, DeliveryHelper, apihelper (ESM), Environment, axios.
import type { EmailHelper } from "@churchapps/apihelper";
import type { WebPushHelper } from "../WebPushHelper.js";
import type { DeliveryHelper } from "../DeliveryHelper.js";
import type { Repos } from "../../repositories/index.js";
import type { Connection, Conversation, Device, Message, Notification, NotificationEntityMute, NotificationPreference, NotificationPreferenceOverride, PrivateMessage } from "../../models/index.js";

// Only the repos and methods a test touches exist; the rest of Repos is never reached. Mocks keep each
// method's parameters but return plain fixtures, so only the parameter lists are checked.
type MockedMethods<T> = { [M in keyof T]?: T[M] extends (...args: infer A) => unknown ? (...args: A) => unknown : T[M] };
type RepoMocks = { [K in keyof Repos]?: MockedMethods<Repos[K]> };
const asRepos = (mocks: RepoMocks) => mocks as Repos;
type Row = Record<string, unknown>;

const sendBulkTypedMessagesMock: jest.MockedFunction<typeof WebPushHelper.sendBulkTypedMessages> = jest.fn();
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

// ExpoPushHelper: no-op to avoid accidentally exercising expo-server-sdk.
jest.mock("../ExpoPushHelper.js", () => ({ ExpoPushHelper: { sendBulkTypedMessages: jest.fn().mockResolvedValue([]) } }));

// DeliveryHelper mock: should NOT be called in this test (recipient is offline).
const sendMessagesMock: jest.MockedFunction<typeof DeliveryHelper.sendMessages> = jest.fn();
sendMessagesMock.mockResolvedValue(0);
jest.mock("../DeliveryHelper.js", () => ({ DeliveryHelper: { sendMessages: sendMessagesMock } }));

// @churchapps/apihelper: ESM-only, breaks CommonJS Jest; mock to avoid loading ArrayHelper/EmailHelper.
const sendTemplatedEmailMock: jest.MockedFunction<typeof EmailHelper.sendTemplatedEmail> = jest.fn();
sendTemplatedEmailMock.mockResolvedValue(undefined);
jest.mock("@churchapps/apihelper", () => ({
  ArrayHelper: { getIds: jest.fn((): unknown[] => []), getAll: jest.fn((): unknown[] => []), getOne: jest.fn((): unknown => null) },
  EmailHelper: { sendEmail: jest.fn().mockResolvedValue(undefined), sendTemplatedEmail: sendTemplatedEmailMock }
}));

// Environment: import.meta.url can't be parsed by CommonJS Jest.
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { getEnvironmentName: () => "test", b1AdminRoot: "https://admin.example.org/" } }));

// Content gateway: event notes link through the event's group.
const loadEventMock = jest.fn<Promise<unknown>, [string, string]>();
jest.mock("../../../../shared/modules/ContentModuleGateway.js", () => ({ getContentModuleGateway: () => ({ loadEvent: loadEventMock }) }));

// Membership gateway: the sender display name comes from the church record.
const loadChurchMock = jest.fn<Promise<unknown>, [string]>();
loadChurchMock.mockResolvedValue({ id: "CHU1", name: "Grace Church" });
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch: loadChurchMock }) }));

// Doing gateway: task and card note titles come from the task (#1586).
const loadTaskMock = jest.fn<Promise<unknown>, [string, string]>();
loadTaskMock.mockResolvedValue(null);
jest.mock("../../../../shared/modules/DoingModuleGateway.js", () => ({ getDoingModuleGateway: () => ({ loadTask: loadTaskMock }) }));

// axios: unused on the socket/push escalation path under test.
jest.mock("axios", () => ({ default: { post: jest.fn() }, post: jest.fn() }));

import { NotificationHelper } from "../NotificationHelper.js";
import { ChurchEmailLimiter } from "../../../../shared/helpers/ChurchEmailLimiter.js";

describe("NotificationHelper.attemptDeliveryWithEscalation", () => {
  beforeEach(() => {
    sendBulkTypedMessagesMock.mockClear();
    sendMessagesMock.mockClear();
    sendBulkTypedMessagesMock.mockResolvedValue([{ token: "webpush:fake", success: true, gone: false, retryable: false }]);
    sendMessagesMock.mockResolvedValue(0);
  });

  function buildRepos(opts: { connections?: Connection[]; devices?: Device[]; pref?: NotificationPreference }) {
    return {
      connection: { loadForNotification: jest.fn(async (): Promise<Connection[]> => opts.connections ?? []) },
      notification: { loadNewCounts: jest.fn(async () => ({ notificationCount: 1, pmCount: 0 })) },
      notificationPreference: { loadByPersonId: jest.fn(async () => opts.pref ?? { allowPush: true, emailFrequency: "individual" }) },
      notificationPreferenceOverride: { loadForPerson: jest.fn(async (): Promise<NotificationPreferenceOverride[]> => []) },
      notificationEntityMute: { loadForPerson: jest.fn(async (): Promise<NotificationEntityMute[]> => []) },
      device: {
        loadForPerson: jest.fn(async (): Promise<Device[]> => opts.devices ?? []),
        deleteByFcmToken: jest.fn(async () => {})
      },
      deliveryLog: { save: jest.fn(async () => ({})) }
    };
  }

  it("escalates to web push when the recipient has no live socket", async () => {
    const repos = buildRepos({
      connections: [], // offline
      devices: [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }]
    });
    NotificationHelper.init(asRepos(repos));

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

  it("also attempts push when the recipient is online (socket success no longer suppresses push)", async () => {
    sendMessagesMock.mockResolvedValueOnce(1);

    const repos = buildRepos({
      connections: [{ socketId: "abc", churchId: "CHU00000001" }],
      devices: [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }]
    });
    NotificationHelper.init(asRepos(repos));

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
    expect(sendBulkTypedMessagesMock).toHaveBeenCalledTimes(1);
    expect(result).toBe("push");
  });

  it("returns socket when online but the recipient has no push devices", async () => {
    sendMessagesMock.mockResolvedValueOnce(1);

    const repos = buildRepos({
      connections: [{ socketId: "abc", churchId: "CHU00000001" }],
      devices: []
    });
    NotificationHelper.init(asRepos(repos));

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
    NotificationHelper.init(asRepos(repos));

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
    NotificationHelper.init(asRepos(repos));

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

  function buildPrivateMessageRepos(privateMessage: PrivateMessage, opts: { connections?: Connection[]; devices?: Device[]; pref?: NotificationPreference; overrides?: NotificationPreferenceOverride[]; existingDm?: Notification[] } = {}) {
    const savedNotifications: Notification[] = [];
    return {
      privateMessage: {
        loadByConversationId: jest.fn(async () => ({ ...privateMessage })),
        save: jest.fn(async (pm: PrivateMessage) => pm)
      },
      message: { loadLatestPerPerson: jest.fn(async (): Promise<Message[]> => []) },
      connection: { loadForNotification: jest.fn(async (): Promise<Connection[]> => opts.connections ?? []) },
      notification: {
        loadNewCounts: jest.fn(async () => ({ notificationCount: 0, pmCount: 1 })),
        loadExistingUnread: jest.fn(async () => opts.existingDm ?? savedNotifications.filter((n) => n.contentType === "privateMessage" && n.isNew)),
        save: jest.fn(async (n: Notification) => {
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
      notificationPreferenceOverride: { loadForPerson: jest.fn(async (): Promise<NotificationPreferenceOverride[]> => opts.overrides ?? []) },
      notificationEntityMute: { loadForPerson: jest.fn(async (): Promise<NotificationEntityMute[]> => []) },
      device: {
        loadForPerson: jest.fn(async (): Promise<Device[]> => opts.devices ?? [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }]),
        deleteByFcmToken: jest.fn(async () => {})
      },
      deliveryLog: { save: jest.fn(async () => ({})) }
    };
  }

  it("notifies only the other participant when the sender is resolved", async () => {
    const repos = buildPrivateMessageRepos({
      id: "PM1",
      churchId: "CHU1",
      conversationId: "CONV1",
      fromPersonId: "PER_A",
      toPersonId: "PER_B"
    });
    NotificationHelper.init(asRepos(repos));

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as Conversation,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Hello" } as Message,
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
    NotificationHelper.init(asRepos(repos));

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as Conversation,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Hello" } as Message,
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
    NotificationHelper.init(asRepos(repos));

    const conv = { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as Conversation;
    await NotificationHelper.checkShouldNotify(conv, { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "One" } as Message, "PER_A");
    await NotificationHelper.checkShouldNotify(conv, { id: "MSG2", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Two" } as Message, "PER_A");

    expect(sendMessagesMock).toHaveBeenCalledTimes(2); // both pinged the socket
    // Reuse: the second message shares the conversation's existing unread row.
    const createCalls = repos.notification.save.mock.calls.filter((c) => !c[0].id).length;
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
    NotificationHelper.init(asRepos(repos));

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as Conversation,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "Unknown", content: "Hello" } as Message,
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
    NotificationHelper.init(asRepos(repos));

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as Conversation,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Hello" } as Message,
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
    NotificationHelper.init(asRepos(repos));

    await NotificationHelper.checkShouldNotify(
      { churchId: "CHU1", id: "CONV1", contentType: "privateMessage" } as Conversation,
      { id: "MSG1", churchId: "CHU1", conversationId: "CONV1", displayName: "User A", content: "Hello" } as Message,
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
    const saved: Notification[] = [];
    const repos = {
      notification: {
        loadPendingEscalation: jest.fn(async (): Promise<Notification[]> => [
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
        save: jest.fn(async (n: Notification) => { saved.push(n); return n; })
      },
      connection: { loadForNotification: jest.fn(async (): Promise<Connection[]> => []) },
      notificationPreference: { loadByPersonId: jest.fn(async () => ({ allowPush: true, emailFrequency: "individual" })) },
      notificationPreferenceOverride: { loadForPerson: jest.fn(async (): Promise<NotificationPreferenceOverride[]> => []) },
      notificationEntityMute: { loadForPerson: jest.fn(async (): Promise<NotificationEntityMute[]> => []) },
      device: { loadForPerson: jest.fn(async () => [{ fcmToken: "webpush:" + JSON.stringify({ endpoint: "https://e/x", keys: { p256dh: "p", auth: "a" } }) }]), deleteByFcmToken: jest.fn(async () => {}) },
      deliveryLog: { save: jest.fn(async () => ({})) }
      // no privateMessage repo — escalation must not reach for it
    };
    NotificationHelper.init(asRepos(repos));

    const result = await NotificationHelper.escalateDelivery();

    expect(sendBulkTypedMessagesMock).toHaveBeenCalledTimes(1);
    const args = sendBulkTypedMessagesMock.mock.calls[0];
    expect(args[3]).toBe("privateMessage"); // push carries the DM type
    expect(args[4]).toBe("PM1");
    expect(saved.at(-1)?.deliveryMethod).toBe("push");
    expect(result.notificationsEscalated).toBe(1);
    expect((result as Row).pmsEscalated).toBeUndefined();
  });
});

describe("NotificationHelper.sendEmailNotifications direct messages", () => {
  type ArrayHelperMock = {
    getIds: jest.Mock<unknown[], [Row[], string]>;
    getAll: jest.Mock<unknown[], [Row[], string, unknown]>;
    getOne: jest.Mock<unknown, [Row[], string, unknown]>;
  };
  const apihelper = jest.requireMock<{ ArrayHelper: ArrayHelperMock }>("@churchapps/apihelper");

  beforeEach(() => {
    sendTemplatedEmailMock.mockClear();
    sendTemplatedEmailMock.mockResolvedValue(undefined);
    loadChurchMock.mockClear();
    apihelper.ArrayHelper.getIds.mockImplementation((arr: Row[], field: string) => [...new Set((arr || []).map((a) => a[field]).filter(Boolean))]);
    apihelper.ArrayHelper.getAll.mockImplementation((arr: Row[], field: string, value: unknown) => (arr || []).filter((a) => a[field] === value));
    apihelper.ArrayHelper.getOne.mockImplementation((arr: Row[], field: string, value: unknown) => (arr || []).find((a) => a[field] === value) || null);
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
    const savedComplete: Notification[] = [];
    const repos = {
      notification: {
        loadUndelivered: jest.fn(async (): Promise<Notification[]> => [
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
        save: jest.fn(async (n: Notification) => { savedComplete.push(n); return n; })
      },
      notificationPreference: { loadByPersonIds: jest.fn(async () => [{ personId: "PER_B", churchId: "CHU1", emailFrequency: "individual" }]) },
      notificationPreferenceOverride: { loadByPersonIds: jest.fn(async (): Promise<NotificationPreferenceOverride[]> => []) },
      deliveryLog: { save: jest.fn(async () => ({})) }
      // no privateMessage repo — the digest must not touch PM rows
    };
    NotificationHelper.init(asRepos(repos));
    const spy = jest.spyOn(NotificationHelper, "getEmailData").mockResolvedValue([
      { id: "PER_B", email: "recipient@example.com" },
      { id: "PER_A", email: "sender@example.com" }
    ]);

    const result = await NotificationHelper.sendEmailNotifications("individual");

    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1);
    const args = sendTemplatedEmailMock.mock.calls[0];
    expect(args[4]).toBe("New Message from Jane Doe"); // subject
    expect(args[7]).toBe("sender@example.com"); // reply-to
    expect(args[0]).toBe('"Grace Church" <support@churchapps.org>'); // church name as sender display name
    expect(args[3]).toBe("https://admin.example.org"); // header link follows the install's admin root
    expect(loadChurchMock).toHaveBeenCalledWith("CHU1");
    expect(savedComplete.at(-1)?.deliveryMethod).toBe("complete");
    expect((result as Row).pmsProcessed).toBeUndefined();
    spy.mockRestore();
  });

  it("sanitizes SES subjects and splits semicolon-separated addresses", async () => {
    const repos = {
      notification: {
        loadUndelivered: jest.fn(async (): Promise<Notification[]> => [
          {
            id: "N1",
            churchId: "CHU1",
            personId: "PER_B",
            contentType: "task",
            contentId: "T1",
            message: "Please review\nthis item",
            category: "tasks"
          }
        ]),
        save: jest.fn(async (n: Notification) => n)
      },
      notificationPreference: { loadByPersonIds: jest.fn(async () => [{ personId: "PER_B", churchId: "CHU1", emailFrequency: "individual" }]) },
      notificationPreferenceOverride: { loadByPersonIds: jest.fn(async (): Promise<NotificationPreferenceOverride[]> => []) },
      deliveryLog: { save: jest.fn(async () => ({})) }
    };
    NotificationHelper.init(asRepos(repos));
    const spy = jest.spyOn(NotificationHelper, "getEmailData").mockResolvedValue([{ id: "PER_B", email: "a@example.com; b@example.com" }]);

    await NotificationHelper.sendEmailNotifications("individual");

    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(2);
    expect(sendTemplatedEmailMock.mock.calls[0][1]).toBe("a@example.com");
    expect(sendTemplatedEmailMock.mock.calls[1][1]).toBe("b@example.com");
    expect(sendTemplatedEmailMock.mock.calls[0][4]).toBe("New Notification: Please review this item");
    expect(sendTemplatedEmailMock.mock.calls[0][4]).not.toMatch(/[\r\n]/);
    expect(sendTemplatedEmailMock.mock.calls[1][0]).toBe('"Grace Church" <support@churchapps.org>');
    expect(loadChurchMock).toHaveBeenCalledTimes(1); // church resolved once per digest, not per address
    spy.mockRestore();
  });

  it("falls back to the bare support address when the church lookup fails", async () => {
    loadChurchMock.mockRejectedValueOnce(new Error("db down"));
    const repos = {
      notification: {
        loadUndelivered: jest.fn(async (): Promise<Notification[]> => [{ id: "N2", churchId: "CHU1", personId: "PER_B", contentType: "task", contentId: "T2", message: "Hello", category: "tasks" }]),
        save: jest.fn(async (n: Notification) => n)
      },
      notificationPreference: { loadByPersonIds: jest.fn(async () => [{ personId: "PER_B", churchId: "CHU1", emailFrequency: "individual" }]) },
      notificationPreferenceOverride: { loadByPersonIds: jest.fn(async (): Promise<NotificationPreferenceOverride[]> => []) },
      deliveryLog: { save: jest.fn(async () => ({})) }
    };
    NotificationHelper.init(asRepos(repos));
    const spy = jest.spyOn(NotificationHelper, "getEmailData").mockResolvedValue([{ id: "PER_B", email: "a@example.com" }]);

    await NotificationHelper.sendEmailNotifications("individual");

    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendTemplatedEmailMock.mock.calls[0][0]).toBe("support@churchapps.org");
    spy.mockRestore();
  });
});

describe("NotificationHelper.createNotifications emailImmediate", () => {
  function buildRepos(opts: { pref?: NotificationPreference; existing?: Notification[] } = {}) {
    return {
      notification: {
        loadExistingUnread: jest.fn(async (): Promise<Notification[]> => opts.existing ?? []),
        loadNewCounts: jest.fn(async () => ({ notificationCount: 0, pmCount: 0 })),
        save: jest.fn(async (n: Notification) => ({ ...n, id: n.id || `NOTIF_${n.personId}` }))
      },
      connection: { loadForNotification: jest.fn(async (): Promise<Connection[]> => []) },
      notificationPreference: { loadByPersonId: jest.fn(async () => opts.pref ?? { allowPush: true, emailFrequency: "individual" }) },
      notificationPreferenceOverride: { loadForPerson: jest.fn(async (): Promise<NotificationPreferenceOverride[]> => []) },
      notificationEntityMute: { loadForPerson: jest.fn(async (): Promise<NotificationEntityMute[]> => []) },
      device: { loadForPerson: jest.fn(async (): Promise<Device[]> => []), deleteByFcmToken: jest.fn(async () => {}) },
      deliveryLog: { save: jest.fn(async () => ({})) }
    };
  }

  let getEmailDataSpy: jest.SpyInstance;
  let peopleInChurchSpy: jest.SpyInstance;

  beforeEach(() => {
    sendTemplatedEmailMock.mockClear();
    sendTemplatedEmailMock.mockResolvedValue(undefined);
    getEmailDataSpy = jest.spyOn(NotificationHelper, "getEmailData");
    peopleInChurchSpy = jest.spyOn(NotificationHelper, "peopleInChurch").mockImplementation(async (_churchId: string, ids: string[]) => ids);
  });

  afterEach(() => {
    getEmailDataSpy.mockRestore();
    peopleInChurchSpy.mockRestore();
  });

  it("keeps workflow-owned app alerts visible without an unread-email escalation", async () => {
    const repos = buildRepos();
    NotificationHelper.init(asRepos(repos));
    const result = await NotificationHelper.createNotifications(["PER1"], "CHU1", "assignment", "PLAN1", "Volunteer Requests: Sample service", undefined, undefined, { appOnly: true, category: "serving_schedule" });
    expect(result[0]).toMatchObject({ deliveryMethod: "complete", isNew: true, category: "serving_schedule" });
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled();
  });

  it("gates workflow emails by church membership and member preferences", async () => {
    NotificationHelper.init(asRepos(buildRepos({ pref: { emailFrequency: "never" } })));
    expect(await NotificationHelper.sendWorkflowEmail("CHU1", "PER1", "CARD1", "volunteer@example.test", "S", "<p>Body</p>")).toContain("skipped");
    NotificationHelper.init(asRepos(buildRepos()));
    peopleInChurchSpy.mockResolvedValue([]);
    expect(await NotificationHelper.sendWorkflowEmail("CHU1", "OTHER", "CARD1", "volunteer@example.test", "S", "<p>Body</p>")).toContain("not in this church");
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled();
  });

  it("keeps approval/rate-limited workflow emails out of the unread queue", async () => {
    const repos = buildRepos(); NotificationHelper.init(asRepos(repos));
    const reserve = jest.spyOn(ChurchEmailLimiter, "reserve").mockResolvedValue(null);
    try {
      expect(await NotificationHelper.sendWorkflowEmail("CHU1", "PER1", "CARD1", "volunteer@example.test", "S", "<p>Body</p>")).toContain("blocked");
      expect(sendTemplatedEmailMock).not.toHaveBeenCalled(); expect(repos.notification.save).not.toHaveBeenCalled();
    } finally { reserve.mockRestore(); }
  });

  it("settles a workflow email reservation after a successful or uncertain transport attempt", async () => {
    NotificationHelper.init(asRepos(buildRepos()));
    const reserve = jest.spyOn(ChurchEmailLimiter, "reserve").mockResolvedValue(["reserve1"]);
    const settle = jest.spyOn(ChurchEmailLimiter, "settle").mockResolvedValue(undefined);
    try {
      expect(await NotificationHelper.sendWorkflowEmail("CHU1", "PER1", "CARD1", "volunteer@example.test", "S", "<p>Body</p>")).toBe("sent");
      expect(sendTemplatedEmailMock.mock.calls[0][0]).toBe('"Grace Church" <support@churchapps.org>');
      expect(sendTemplatedEmailMock.mock.calls[0][3]).toBe("https://admin.example.org");
      expect(settle).toHaveBeenCalledWith("CHU1", "reserve1", true);
      sendTemplatedEmailMock.mockRejectedValueOnce(new Error("transport timeout"));
      await expect(NotificationHelper.sendWorkflowEmail("CHU1", "PER1", "CARD1", "volunteer@example.test", "S", "<p>Body</p>")).rejects.toThrow("timeout");
      expect(settle).toHaveBeenCalledWith("CHU1", "reserve1", false, expect.stringContaining("timeout"));
    } finally { reserve.mockRestore(); settle.mockRestore(); }
  });

  it("drops recipients who are not in the notifying church", async () => {
    const repos = buildRepos();
    NotificationHelper.init(asRepos(repos));
    peopleInChurchSpy.mockResolvedValue([]);
    const result = await NotificationHelper.createNotifications(["OTHER_CHURCH_PERSON"], "CHU1", "task", "T1", "hi", undefined, undefined, { emailImmediate: true });
    expect(result).toEqual([]);
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled();
  });

  it("sends the per-recipient rich email, logs delivery, and marks the row complete when the gate allows", async () => {
    const repos = buildRepos();
    NotificationHelper.init(asRepos(repos));
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
    expect(args[0]).toBe('"Grace Church" <support@churchapps.org>');
    expect(args[1]).toBe("per1@example.com");
    expect(args[3]).toBe("https://admin.example.org");
    expect(args[4]).toBe("Custom subject");
    expect(args[5]).toBe("<p>Custom html</p>");
    expect(repos.deliveryLog.save).toHaveBeenCalledWith(expect.objectContaining({ deliveryMethod: "email", success: true, personId: "PER1" }));
    expect(result[0].deliveryMethod).toBe("complete");
  });

  it("draws church-authored email from the church's allowance and skips the send when it is exhausted", async () => {
    const repos = buildRepos();
    NotificationHelper.init(asRepos(repos));
    getEmailDataSpy.mockResolvedValue([{ id: "PER1", email: "per1@example.com" }]);
    const reserve = jest.spyOn(ChurchEmailLimiter, "reserve").mockResolvedValueOnce(["R1"]).mockResolvedValueOnce(null);
    const settle = jest.spyOn(ChurchEmailLimiter, "settle").mockResolvedValue(undefined);
    const opts = { emailImmediate: true, churchAuthored: true, emailByPerson: { PER1: { subject: "S", html: "<p>h</p>" } } };

    await NotificationHelper.createNotifications(["PER1"], "CHU1", "task", "TPL1", "S", undefined, undefined, opts);
    expect(reserve).toHaveBeenCalledWith("CHU1", "workflowEmail", [expect.objectContaining({ address: "per1@example.com", personId: "PER1" })]);
    expect(settle).toHaveBeenCalledWith("CHU1", "R1", true);
    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1);

    await NotificationHelper.createNotifications(["PER1"], "CHU1", "task", "TPL1", "S", undefined, undefined, opts);
    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1);
    expect(repos.deliveryLog.save).toHaveBeenCalledWith(expect.objectContaining({ success: false, errorMessage: "Daily email limit reached" }));
    reserve.mockRestore();
    settle.mockRestore();
  });

  it("bypasses the unread-dedup guard so an unread earlier row does not swallow an explicit send", async () => {
    const repos = buildRepos({ existing: [{ personId: "PER1" }] });
    NotificationHelper.init(asRepos(repos));
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
    NotificationHelper.init(asRepos(repos));
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
    NotificationHelper.init(asRepos(repos));
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
    NotificationHelper.init(asRepos(repos));
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

describe("NotificationHelper.sendEmailNotification volunteer requests", () => {
  beforeEach(() => {
    sendTemplatedEmailMock.mockClear();
    sendTemplatedEmailMock.mockResolvedValue(undefined);
    NotificationHelper.init(asRepos({ notification: { save: jest.fn(async (n: Notification) => n) }, deliveryLog: { save: jest.fn(async () => ({})) } }));
  });

  it("keeps the position's period and breaks before the confirm line", async () => {
    const notification = { id: "N1", churchId: "CHU1", personId: "PER1", contentType: "assignment", contentId: "A1", message: "Volunteer Requests: Oct 25, 2026 - Session 1 - Teacher. Please log in and confirm." } as Notification;

    await NotificationHelper.sendEmailNotification("volunteer@example.com", [notification]);

    expect(sendTemplatedEmailMock).toHaveBeenCalledTimes(1);
    const content: string = sendTemplatedEmailMock.mock.calls[0][5];
    expect(content.replace(/<[^>]+>/g, "")).not.toMatch(/Teacher\.Please/);
    expect(content).toContain("<h4>Oct 25, 2026 - Session 1 - Teacher.</h4>");
  });

  it("escapes a volunteer's decline reason in the leader email", async () => {
    const notification = { id: "N2", churchId: "CHU1", personId: "PER1", contentType: "assignment", contentId: "P1", message: "Jane declined serving as Usher for Sunday AM. Reason: <img src=x onerror=alert(1)> & out of town" } as Notification;

    await NotificationHelper.sendEmailNotification("leader@example.com", [notification]);

    const content: string = sendTemplatedEmailMock.mock.calls[0][5];
    expect(content).not.toContain("<img");
    expect(content).toContain("Reason: &lt;img src=x onerror=alert(1)&gt; &amp; out of town");
  });
});

describe("NotificationHelper.checkShouldNotify conversation message text", () => {
  let createNotificationsSpy: jest.SpyInstance;

  beforeEach(() => {
    NotificationHelper.init(asRepos({
      message: {
        loadLatestPerPerson: jest.fn(async () => [
          { personId: "PER_A", messageType: "comment", timeSent: new Date("2026-10-30") },
          { personId: "PER_B", messageType: "comment", timeSent: new Date("2026-10-31") }
        ])
      },
      device: { loadForPerson: jest.fn(async (): Promise<Device[]> => []) }
    }));
    createNotificationsSpy = jest.spyOn(NotificationHelper, "createNotifications").mockResolvedValue([]);
  });

  afterEach(() => {
    createNotificationsSpy.mockRestore();
  });

  const notify = async (conversation: Conversation) => {
    await NotificationHelper.checkShouldNotify({ id: "CONV1", churchId: "CHU1", contentId: "C1", ...conversation }, { id: "MSG1", churchId: "CHU1", conversationId: "CONV1" } as Message, "PER_A");
    return createNotificationsSpy.mock.calls[0][4];
  };

  it("adds the conversation title when there is one", async () => {
    expect(await notify({ contentType: "task", title: "Task #12" })).toBe("New message: Task #12");
  });

  it("does not print null for a conversation with no title", async () => {
    expect(await notify({ contentType: "task", title: null })).toBe("New message");
  });

  it("does not print null when a group name cannot be resolved and there is no title", async () => {
    expect(await notify({ contentType: "group", title: null })).toBe("New message");
  });

  // #1586: task note threads are titled "Task #<id> Notes"; the notification should name the task.
  it("names the task instead of its id for task notes", async () => {
    loadTaskMock.mockResolvedValueOnce({ id: "wseHZndiKmT", title: "Fix the projector" });
    const message = await notify({ contentType: "task", contentId: "wseHZndiKmT", title: "Task #wseHZndiKmT Notes" });
    expect(message).toBe("New message: Fix the projector Notes");
    expect(loadTaskMock).toHaveBeenCalledWith("CHU1", "wseHZndiKmT");
  });

  it("names the task instead of its id for workflow card notes", async () => {
    loadTaskMock.mockResolvedValueOnce({ id: "CARD1", title: "Call the new family" });
    expect(await notify({ contentType: "workflowCard", contentId: "CARD1", title: "Card CARD1 Notes" })).toBe("New message: Call the new family Notes");
  });

  it("keeps the stored title when the task cannot be loaded", async () => {
    loadTaskMock.mockRejectedValueOnce(new Error("db down"));
    expect(await notify({ contentType: "task", title: "Task #12 Notes" })).toBe("New message: Task #12 Notes");
  });
});

// #1495: a note notification should open the note where it was written.
describe("NotificationHelper.checkShouldNotify note links (#1495)", () => {
  let createNotificationsSpy: jest.SpyInstance;

  beforeEach(() => {
    NotificationHelper.init(asRepos({
      message: { loadLatestPerPerson: jest.fn(async () => [{ personId: "PER_B", messageType: "comment", timeSent: new Date("2026-10-31") }]) },
      device: { loadForPerson: jest.fn(async (): Promise<Device[]> => []) }
    }));
    createNotificationsSpy = jest.spyOn(NotificationHelper, "createNotifications").mockResolvedValue([]);
    loadEventMock.mockReset();
  });

  afterEach(() => {
    createNotificationsSpy.mockRestore();
  });

  const linkFor = async (contentType: string) => {
    await NotificationHelper.checkShouldNotify({ id: "CONV1", churchId: "CHU1", contentType, contentId: "C1", title: "Notes" } as Conversation, { id: "MSG1", churchId: "CHU1", conversationId: "CONV1" } as Message, "PER_A");
    return createNotificationsSpy.mock.calls.at(-1)[5];
  };

  it("links event notes to the event's group calendar in B1 Admin", async () => {
    loadEventMock.mockResolvedValue({ id: "C1", groupId: "G1" });
    expect(await linkFor("eventNote")).toBe("https://admin.example.org/groups/G1?view=calendar");
    expect(loadEventMock).toHaveBeenCalledWith("CHU1", "C1");
  });

  it("leaves an event note without a group unlinked", async () => {
    loadEventMock.mockResolvedValue({ id: "C1" });
    expect(await linkFor("eventNote")).toBeUndefined();
  });

  it("links person notes to the person's notes in B1 Admin", async () => {
    expect(await linkFor("person")).toBe("https://admin.example.org/people/C1?view=notes");
    expect(await linkFor("personConfidential")).toBe("https://admin.example.org/people/C1?view=notes");
  });

  it("links workflow card notes to the task in B1 Admin", async () => {
    expect(await linkFor("workflowCard")).toBe("https://admin.example.org/serving/tasks/C1");
  });

  it("links group notes to the group's notes in the app", async () => {
    expect(await linkFor("groupNote")).toBe("/mobile/groups/C1?openChat=1&chatTab=notes");
  });
});
