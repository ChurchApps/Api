import "reflect-metadata";
import type { Request, Response } from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { Conversation, Message } from "../../models/index.js";

// ChurchAppsSupport#1676: an event request has one thread that calendar staff and the requester share.
// The raw event row the content gateway hands back, as far as the gate reads it.
interface EventRow { id: string; approvalStatus?: string | null; requestedBy?: string | null; groupId?: string; notesViewRole?: string }

jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} async writeAuditLog() {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, EncryptionHelper: { decrypt: jest.fn((s: string) => s) } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn() } }));
jest.mock("../../helpers/NotificationHelper", () => ({ NotificationHelper: { checkShouldNotify: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, tasks: { view: "tasksView" }, chat: { host: "chatHost" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" }, calendars: { admin: "calendarsAdmin" } } }));
const mockLoadEvent = jest.fn<Promise<EventRow | null>, unknown[]>(async () => null);
jest.mock("../../../../shared/modules/ContentModuleGateway.js", () => ({ getContentModuleGateway: () => ({ loadEvent: (...args: unknown[]) => mockLoadEvent(...args) }) }));

import { ConversationController } from "../ConversationController.js";
import { MessageController } from "../MessageController.js";

const thread: Conversation = { id: "conv1", churchId: "c1", contentType: "eventRequest", contentId: "evt1", allowAnonymousPosts: false, visibility: "hidden" };
const request: EventRow = { id: "evt1", approvalStatus: "pending", requestedBy: "requester" };

const au = (personId: string, access: string[] = [], groupIds: string[] = []) => ({
  id: "u-" + personId,
  churchId: "c1",
  personId,
  firstName: "Pat",
  lastName: "Doe",
  groupIds,
  leaderGroupIds: [] as string[],
  checkAccess: (perm: unknown) => access.some((a) => a === perm)
}) as AuthenticatedUser;

const REQUESTER = au("requester");
const OTHER_MEMBER = au("someoneElse", [], ["g1"]);
const CALENDAR_ADMIN = au("calAdmin", ["calendarsAdmin"]);
const CONTENT_EDITOR = au("editor", ["contentEdit"]);
const PEOPLE_EDITOR = au("peopleStaff", ["peopleEdit"]);

interface RepoOpts { byId?: Conversation | null; forContent?: Conversation[]; message?: Message | null; counts?: { id: string; contentId: string; postCount: number }[] }

function repos(opts: RepoOpts = {}) {
  return {
    conversation: {
      loadById: jest.fn(async () => (opts.byId === undefined ? thread : opts.byId)),
      loadForContent: jest.fn(async () => opts.forContent ?? []),
      loadCountsForContent: jest.fn(async (_churchId: string, _contentType: string, ids: string[]) => (opts.counts ?? []).filter((c) => ids.includes(c.contentId))),
      save: jest.fn(async (c: Conversation) => ({ ...c, id: c.id || "new1" })),
      updateStats: jest.fn(async (): Promise<void> => undefined),
      convertToModel: (c: Conversation) => c,
      convertAllToModel: (rows: Conversation[]) => rows
    },
    message: {
      loadForConversation: jest.fn(async (): Promise<Message[]> => [{ id: "m1" }]),
      loadById: jest.fn(async () => opts.message ?? {}),
      save: jest.fn(async (m: Message) => ({ ...m, id: m.id || "msg1" })),
      delete: jest.fn(async (): Promise<void> => undefined),
      convertToModel: (m: Message) => m,
      convertAllToModel: (rows: Message[]) => rows
    }
  };
}

interface JsonStub { obj?: unknown; status?: number }
const status = (result: unknown) => (result as JsonStub).status;
const res = {} as Response;
const req = (r: { body?: unknown; query?: Request["query"] } = {}) => r as Request;

function attach<C extends ConversationController | MessageController>(controller: C, r: ReturnType<typeof repos>, principal: AuthenticatedUser): C {
  controller.actionWrapper = (_req, _res, action) => action(principal);
  controller.actionWrapperAnon = (_req, _res, action) => action();
  controller.authUser = () => principal;
  Object.assign(controller, { repos: r, json: (obj: unknown, status: number): JsonStub => ({ obj, status }) });
  return controller;
}

beforeEach(() => {
  mockLoadEvent.mockReset();
  mockLoadEvent.mockResolvedValue(request);
});

describe("reading an event request thread", () => {
  const read = (principal: AuthenticatedUser) => attach(new MessageController(), repos(), principal).loadByConversation("conv1", req() as Request<{}, {}, []>, res);

  it("lets the requester and calendar staff read it", async () => {
    for (const principal of [REQUESTER, CALENDAR_ADMIN, CONTENT_EDITOR]) expect(await read(principal)).toEqual([{ id: "m1" }]);
  });

  it("401s every other member, including staff without a calendar permission", async () => {
    for (const principal of [OTHER_MEMBER, PEOPLE_EDITOR]) expect(status(await read(principal))).toBe(401);
  });

  it("401s the former requester once the request is moved to someone else", async () => {
    mockLoadEvent.mockResolvedValue({ ...request, requestedBy: "newOwner" });
    expect(status(await read(REQUESTER))).toBe(401);
  });

  it("401s a member on an event that was never a request", async () => {
    mockLoadEvent.mockResolvedValue({ id: "evt1", requestedBy: "requester", approvalStatus: null });
    expect(status(await read(REQUESTER))).toBe(401);
  });

  it("gates the lookup by event the same way", async () => {
    const lookup = (principal: AuthenticatedUser) => attach(new ConversationController(), repos({ forContent: [thread] }), principal).loadByContent("c1", "eventRequest", "evt1", req() as Request<{}, {}, null>, res);
    expect(await lookup(REQUESTER)).toEqual([thread]);
    expect(status(await lookup(OTHER_MEMBER))).toBe(401);
  });
});

describe("posting to an event request thread", () => {
  const post = (principal: AuthenticatedUser) => {
    const r = repos();
    return { r, result: attach(new MessageController(), r, principal).save(req({ body: [{ conversationId: "conv1", content: "Can we move it to 3pm?" }] }) as Request<{}, {}, Message[]>, res) };
  };

  it("saves a message from the requester and from calendar staff", async () => {
    for (const principal of [REQUESTER, CALENDAR_ADMIN, CONTENT_EDITOR]) {
      const { r, result } = post(principal);
      expect(status(await result)).toBeUndefined();
      expect(r.message.save).toHaveBeenCalledTimes(1);
    }
  });

  it("401s anyone else and saves nothing", async () => {
    const { r, result } = post(OTHER_MEMBER);
    expect(status(await result)).toBe(401);
    expect(r.message.save).not.toHaveBeenCalled();
  });
});

describe("removing a message from an event request thread", () => {
  const remove = (principal: AuthenticatedUser, authorId: string) => {
    const r = repos({ message: { id: "m1", conversationId: "conv1", personId: authorId } });
    return { r, result: attach(new MessageController(), r, principal).delete("m1", req() as Request<{}, {}, null>, res) };
  };

  it("lets the requester remove their own message but not a staff message", async () => {
    expect(status(await remove(REQUESTER, "requester").result)).toBe(200);
    const blocked = remove(REQUESTER, "calAdmin");
    expect(status(await blocked.result)).toBe(401);
    expect(blocked.r.message.delete).not.toHaveBeenCalled();
  });

  it("lets calendar staff remove any message", async () => {
    expect(status(await remove(CALENDAR_ADMIN, "requester").result)).toBe(200);
  });
});

describe("starting an event request thread", () => {
  const create = (principal: AuthenticatedUser, existing: Conversation[] = []) => {
    const r = repos({ forContent: existing });
    const body = [{ contentType: "eventRequest", contentId: "evt1", title: "Baptism", visibility: "public", allowAnonymousPosts: true, groupId: "g1" }];
    return { r, result: attach(new ConversationController(), r, principal).save(req({ body }) as Request<{}, {}, Conversation[]>, res) };
  };

  it("creates a hidden thread for the requester and for staff, whatever the client sent", async () => {
    for (const principal of [REQUESTER, CALENDAR_ADMIN]) {
      const { r, result } = create(principal);
      expect(await result).toEqual([expect.objectContaining({ id: "new1", churchId: "c1", contentType: "eventRequest", contentId: "evt1" })]);
      expect(r.conversation.save).toHaveBeenCalledWith(expect.objectContaining({ visibility: "hidden", allowAnonymousPosts: false, groupId: undefined }));
    }
  });

  it("hands back the existing thread instead of making a second one", async () => {
    const { r, result } = create(CALENDAR_ADMIN, [thread]);
    expect(await result).toEqual([thread]);
    expect(r.conversation.save).not.toHaveBeenCalled();
  });

  it("401s a member who did not make the request", async () => {
    const { r, result } = create(OTHER_MEMBER);
    expect(status(await result)).toBe(401);
    expect(r.conversation.save).not.toHaveBeenCalled();
  });
});

describe("event request message counts", () => {
  const counts = [{ id: "conv1", contentId: "evt1", postCount: 3 }, { id: "conv2", contentId: "evt2", postCount: 1 }];
  const call = (principal: AuthenticatedUser, eventIds = "evt1,evt2") => {
    const r = repos({ counts });
    return { r, result: attach(new ConversationController(), r, principal).eventRequestCounts(req({ query: { eventIds } }) as Request<{}, {}, null>, res) };
  };

  it("returns every asked-for request to calendar staff without loading events", async () => {
    expect(await call(CALENDAR_ADMIN).result).toEqual([{ eventId: "evt1", conversationId: "conv1", postCount: 3 }, { eventId: "evt2", conversationId: "conv2", postCount: 1 }]);
    expect(mockLoadEvent).not.toHaveBeenCalled();
  });

  it("returns only the caller's own requests to a member", async () => {
    mockLoadEvent.mockImplementation(async (_churchId, id) => (id === "evt1" ? request : { id: "evt2", approvalStatus: "pending", requestedBy: "someoneElse" }));
    const { r, result } = call(REQUESTER);
    expect(await result).toEqual([{ eventId: "evt1", conversationId: "conv1", postCount: 3 }]);
    expect(r.conversation.loadCountsForContent).toHaveBeenCalledWith("c1", "eventRequest", ["evt1"]);
  });

  it("401s a signed-out caller", async () => {
    const anonymous = { id: "", churchId: "", checkAccess: () => false } as unknown as AuthenticatedUser;
    expect(status(await call(anonymous).result)).toBe(401);
  });
});

describe("event notes stay staff-only", () => {
  it("still 401s the requester on the event's staff notes", async () => {
    const notes: Conversation = { ...thread, id: "notes1", contentType: "eventNote" };
    const r = repos({ byId: notes });
    expect(status(await attach(new MessageController(), r, REQUESTER).loadByConversation("notes1", req() as Request<{}, {}, []>, res))).toBe(401);
  });
});
