import "reflect-metadata";

// Notes page feed (ChurchAppsSupport#1334): each section only returns notes the caller could already open.
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: jest.fn() }, EncryptionHelper: { decrypt: jest.fn() } }));
jest.mock("../../helpers/DeliveryHelper", () => ({ DeliveryHelper: { sendConversationMessages: jest.fn() } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { content: { edit: "contentEdit" }, tasks: { view: "tasksView" }, chat: { host: "chatHost" }, people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" }, calendars: { admin: "calendarsAdmin" } } }));

const events: Record<string, any> = {
  e1: { id: "e1", title: "Staff Retreat", groupId: "g1", notesViewRole: "leaders" },
  e2: { id: "e2", title: "Youth Night", groupId: "g2" }
};
const tasks: Record<string, any> = {
  t1: { id: "t1", title: "Follow up with Donald", workflowId: "w1", assignedToType: "person", assignedToId: "p1" },
  t2: { id: "t2", title: "Someone else's card", workflowId: "w1", assignedToType: "person", assignedToId: "p9" }
};
jest.mock("../../../../shared/modules/ContentModuleGateway.js", () => ({ getContentModuleGateway: () => ({ loadEvent: async (_c: string, id: string) => events[id] ?? null }) }));
jest.mock("../../../../shared/modules/DoingModuleGateway.js", () => ({ getDoingModuleGateway: () => ({ loadTask: async (_c: string, id: string) => tasks[id] ?? null }) }));
jest.mock("../../../../shared/modules/MembershipModuleGateway.js", () => ({
  getMembershipModuleGateway: () => ({
    loadPeople: async (_c: string, ids: string[]) => ids.map((id) => ({ id, displayName: id === "per1" ? "Donald Clark" : "Someone" })),
    loadGroup: async (_c: string, id: string) => ({ id, name: id === "g1" ? "Adult Bible Class" : "Other" })
  })
}));

import { ConversationController } from "../ConversationController.js";

const au = (opts: any = {}) => ({
  id: "u1",
  churchId: "c1",
  personId: "p1",
  groupIds: opts.groupIds ?? [],
  leaderGroupIds: opts.leaderGroupIds ?? [],
  checkAccess: (perm: any) => (opts.access ?? []).includes(perm)
});

const row = (id: string, contentType: string, contentId: string, minutesAgo: number, content = "Note " + id) => ({
  messageId: id,
  conversationId: "cv-" + contentId,
  contentType,
  contentId,
  personId: "p2",
  displayName: "Demo User",
  timeSent: new Date(Date.UTC(2026, 9, 23, 12, 0) - minutesAgo * 60000),
  content
});

// Fake repo that honors the content type / id filters and the keyset cursor like the SQL does.
function feedRepo(allRows: any[]) {
  return jest.fn(async (_churchId: string, types: string[], ids: string[] | null, before: any, limit: number) => allRows
    .filter((r) => types.includes(r.contentType) && (!ids || ids.includes(r.contentId)))
    .filter((r) => !before || r.timeSent < before.timeSent || (r.timeSent.getTime() === before.timeSent.getTime() && r.messageId < before.id))
    .sort((a, b) => b.timeSent.getTime() - a.timeSent.getTime() || (a.messageId < b.messageId ? 1 : -1))
    .slice(0, limit));
}

async function feed(rows: any[], principal: any, query: any) {
  const controller: any = new ConversationController();
  const loadNotesFeed = feedRepo(rows);
  controller.repos = { conversation: { loadNotesFeed } };
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(principal);
  controller.json = (data: any, status: number) => ({ status, data });
  const result = await controller.notesFeed({ query } as any, {} as any);
  return { result, loadNotesFeed };
}

const ROWS = [
  row("m1", "person", "per1", 1, "Visited Donald in the hospital"),
  row("m2", "personConfidential", "per1", 2, "Confidential counseling note"),
  row("m3", "groupNote", "g1", 3),
  row("m4", "groupNote", "g2", 4),
  row("m5", "eventNote", "e1", 5),
  row("m6", "eventNote", "e2", 6),
  row("m7", "workflowCard", "t1", 7),
  row("m8", "workflowCard", "t2", 8)
];

describe("GET /messaging/conversations/notes/feed", () => {
  it("rejects an unknown section", async () => {
    const { result } = await feed(ROWS, au({ access: ["peopleEdit"] }), { section: "everything" });
    expect(result.status).toBe(400);
  });

  it("people: hides confidential notes without viewConfidentialNotes and names the person", async () => {
    const { result } = await feed(ROWS, au({ access: ["peopleEdit"] }), { section: "people" });
    expect(result.notes.map((n: any) => n.messageId)).toEqual(["m1"]);
    expect(result.notes[0]).toMatchObject({ sourceName: "Donald Clark", contentId: "per1", displayName: "Demo User", content: "Visited Donald in the hospital" });
  });

  it("people: includes confidential notes for holders of viewConfidentialNotes", async () => {
    const { result } = await feed(ROWS, au({ access: ["peopleEdit", "peopleViewConfidentialNotes"] }), { section: "people" });
    expect(result.notes.map((n: any) => n.messageId)).toEqual(["m1", "m2"]);
  });

  it("people: returns nothing without people access and never queries", async () => {
    const { result, loadNotesFeed } = await feed(ROWS, au(), { section: "people" });
    expect(result.notes).toEqual([]);
    expect(result.cursor).toBeNull();
    expect(loadNotesFeed.mock.calls.every((c) => c[1].length === 0)).toBe(true);
  });

  it("groups: only groups the caller leads, even for staff", async () => {
    const { result } = await feed(ROWS, au({ leaderGroupIds: ["g1"], access: ["peopleEdit", "contentEdit"] }), { section: "groups" });
    expect(result.notes.map((n: any) => n.messageId)).toEqual(["m3"]);
    expect(result.notes[0].sourceName).toBe("Adult Bible Class");
    const staff = await feed(ROWS, au({ access: ["peopleEdit", "contentEdit"] }), { section: "groups" });
    expect(staff.result.notes).toEqual([]);
  });

  it("events: follows each event's notesViewRole; calendar staff see all", async () => {
    const leader = await feed(ROWS, au({ leaderGroupIds: ["g1", "g2"] }), { section: "events" });
    expect(leader.result.notes.map((n: any) => n.messageId)).toEqual(["m5"]);
    expect(leader.result.notes[0]).toMatchObject({ sourceName: "Staff Retreat", parentId: "g1" });
    const staff = await feed(ROWS, au({ access: ["calendarsAdmin"] }), { section: "events" });
    expect(staff.result.notes.map((n: any) => n.messageId)).toEqual(["m5", "m6"]);
  });

  it("workflows: only cards the caller can open", async () => {
    const mine = await feed(ROWS, au(), { section: "workflows" });
    expect(mine.result.notes.map((n: any) => n.messageId)).toEqual(["m7"]);
    expect(mine.result.notes[0]).toMatchObject({ sourceName: "Follow up with Donald", parentId: "w1" });
    const viewer = await feed(ROWS, au({ access: ["tasksView"] }), { section: "workflows" });
    expect(viewer.result.notes.map((n: any) => n.messageId)).toEqual(["m7", "m8"]);
  });

  it("pages newest first with a cursor and trims long notes", async () => {
    const many = Array.from({ length: 5 }, (_, i) => row("p" + i, "person", "per1", i, i === 0 ? "x".repeat(400) : "short"));
    const first = await feed(many, au({ access: ["peopleEdit"] }), { section: "people", limit: "2" });
    expect(first.result.notes.map((n: any) => n.messageId)).toEqual(["p0", "p1"]);
    expect(first.result.notes[0].content.length).toBeLessThanOrEqual(301);
    expect(first.result.cursor).toBeTruthy();
    const second = await feed(many, au({ access: ["peopleEdit"] }), { section: "people", limit: "2", before: first.result.cursor });
    expect(second.result.notes.map((n: any) => n.messageId)).toEqual(["p2", "p3"]);
    const third = await feed(many, au({ access: ["peopleEdit"] }), { section: "people", limit: "2", before: second.result.cursor });
    expect(third.result.notes.map((n: any) => n.messageId)).toEqual(["p4"]);
    expect(third.result.cursor).toBeNull();
  });
});
