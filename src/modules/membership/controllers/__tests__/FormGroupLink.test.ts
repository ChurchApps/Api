import "reflect-metadata";
jest.mock("../../../../shared/infrastructure/index.js", () => ({ BaseController: class { constructor(_m: string) {} } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { forms: { admin: "formsAdmin", edit: "formsEdit" } },
  Environment: { supportEmail: "s@t", b1AdminRoot: "http://b1" },
  ConversationalFormHelper: { extractContact: jest.fn(), findOrCreatePerson: jest.fn(), applyTokens: jest.fn() },
  UserChurchHelper: { createForGroupMember: jest.fn() }
}));
jest.mock("../../models/index", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTransactional: jest.fn() } }));
jest.mock("../../../../shared/helpers/NotificationService", () => ({ NotificationService: { createNotifications: jest.fn() } }));
jest.mock("../../../../shared/modules/index.js", () => ({ getContentModuleGateway: () => contentGateway }));

const contentGateway: any = { loadEventsForGroup: jest.fn(async () => []), loadEvent: jest.fn(async () => null) };

import { MembershipBaseController } from "../MembershipBaseController.js";
import { FormController } from "../FormController.js";
import { FormSubmissionController } from "../FormSubmissionController.js";

const day = 24 * 60 * 60 * 1000;
const forms: Record<string, any> = {
  linked: { id: "linked", churchId: "c1", name: "Outreach report", contentType: "form", groupId: "g1", archived: false },
  closed: { id: "closed", churchId: "c1", name: "Last year", contentType: "form", groupId: "g1", archived: false, accessEndTime: new Date(Date.now() - 10 * day) },
  other: { id: "other", churchId: "c1", name: "Other group", contentType: "form", groupId: "g2", archived: false },
  camp: { id: "camp", churchId: "c1", name: "Camp sign-up", contentType: "form", archived: false }
};

function au(opts: any = {}) {
  return { id: "u1", churchId: "c1", personId: "p1", groupIds: opts.groupIds ?? [], leaderGroupIds: opts.leaderGroupIds ?? [], checkAccess: (p: string) => (opts.perms ?? []).includes(p) };
}

function repos() {
  return {
    form: {
      load: jest.fn(async (_c: string, id: string) => forms[id] ?? null),
      loadWithMemberPermissions: jest.fn(async () => null),
      loadForGroup: jest.fn(async (_c: string, groupId: string) => Object.values(forms).filter((f) => f.groupId === groupId)),
      convertToModel: (_c: string, d: any) => d,
      convertAllToModel: (_c: string, d: any[]) => d
    },
    formSubmission: {
      load: jest.fn(async (_c: string, id: string) => (id === "s1" ? { id: "s1", formId: "linked", contentType: "form", contentId: "linked" } : id === "s2" ? { id: "s2", formId: "camp", contentType: "event", contentId: "e1" } : null)),
      loadByFormId: jest.fn(async (_c: string, formId: string) => (formId === "linked" ? [{ id: "s1", formId: "linked" }] : [])),
      loadForContent: jest.fn(async (_c: string, type: string, id: string) => (type === "event" && id === "e1" ? [{ id: "s2", formId: "camp", contentType: "event", contentId: "e1", submittedBy: "p9" }] : [])),
      convertToModel: (_c: string, d: any) => d,
      convertAllToModel: (_c: string, d: any[]) => d
    },
    person: { loadByIds: jest.fn(async () => [{ id: "p9", displayName: "Donald Clark" }]) },
    question: { loadForForm: jest.fn(async () => [{ id: "q1", title: "How many people did you meet?" }]), convertAllToModel: (_c: string, d: any[]) => d },
    answer: {
      loadForFormSubmission: jest.fn(async () => [{ id: "a1", questionId: "q1", value: "12" }]),
      loadForFormSubmissions: jest.fn(async () => [{ id: "a1", formSubmissionId: "s1", questionId: "q1", value: "12" }, { id: "a2", formSubmissionId: "s2", questionId: "q1", value: "3" }]),
      convertAllToModel: (_c: string, d: any[]) => d
    }
  };
}

function wire<T>(controller: T, user: any): T {
  (controller as any).repos = repos();
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(user);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (controller as any).include = () => true;
  return controller;
}

describe("form linked to a group: leader view access", () => {
  it("lets a leader of the form's group view its submissions", async () => {
    const c = wire(new MembershipBaseController(), au({ leaderGroupIds: ["g1"] }));
    expect(await c.formAccess(au({ leaderGroupIds: ["g1"] }) as any, "linked", "view")).toBe(true);
  });

  it("does not let that leader manage (edit/delete) the form", async () => {
    const c = wire(new MembershipBaseController(), au({ leaderGroupIds: ["g1"] }));
    expect(await c.formAccess(au({ leaderGroupIds: ["g1"] }) as any, "linked")).toBe(false);
  });

  it("refuses a plain member of the group and a leader of another group", async () => {
    const c = wire(new MembershipBaseController(), au());
    expect(await c.formAccess(au({ groupIds: ["g1"] }) as any, "linked", "view")).toBe(false);
    expect(await c.formAccess(au({ leaderGroupIds: ["g2"] }) as any, "linked", "view")).toBe(false);
  });

  it("GET /formsubmissions/:id lets the group leader read one submission", async () => {
    const user = au({ leaderGroupIds: ["g1"] });
    const c = wire(new FormSubmissionController(), user);
    const result: any = await (c as any).get("s1", { query: {} }, {});
    expect(result.status).toBeUndefined();
    expect(result.id).toBe("s1");
  });

  it("GET /formsubmissions/:id refuses a plain member", async () => {
    const c = wire(new FormSubmissionController(), au({ groupIds: ["g1"] }));
    const result: any = await (c as any).get("s1", { query: {} }, {});
    expect(result.status).toBe(401);
  });

  it("GET /formsubmissions/:id lets the leader of an event's group read its registration answers", async () => {
    contentGateway.loadEvent.mockResolvedValueOnce({ id: "e1", groupId: "g1", formId: "camp" });
    const c = wire(new FormSubmissionController(), au({ leaderGroupIds: ["g1"] }));
    const result: any = await (c as any).get("s2", { query: {} }, {});
    expect(result.id).toBe("s2");
  });
});

describe("GET /forms/group/:groupId", () => {
  it("lists open linked forms to a group member, without submission data", async () => {
    const c = wire(new FormController(), au({ groupIds: ["g1"] }));
    const result: any = await (c as any).getForGroup("g1", {}, {});
    expect(result.map((f: any) => f.id)).toEqual(["linked"]);
    expect(result[0]).toEqual({ id: "linked", name: "Outreach report", description: undefined, open: true });
  });

  it("also lists closed linked forms to a leader, flagged closed", async () => {
    const c = wire(new FormController(), au({ groupIds: ["g1"], leaderGroupIds: ["g1"] }));
    const result: any = await (c as any).getForGroup("g1", {}, {});
    expect(result.map((f: any) => [f.id, f.open])).toEqual([["linked", true], ["closed", false]]);
  });

  it("refuses someone outside the group", async () => {
    const c = wire(new FormController(), au({ groupIds: ["g2"] }));
    const result: any = await (c as any).getForGroup("g1", {}, {});
    expect(result.status).toBe(401);
  });
});

describe("GET /formsubmissions/group/:groupId", () => {
  it("returns linked form and event registration answers to a leader", async () => {
    contentGateway.loadEventsForGroup.mockResolvedValueOnce([{ id: "e1", title: "Men's retreat", groupId: "g1", formId: "camp" }]);
    const c = wire(new FormSubmissionController(), au({ groupIds: ["g1"], leaderGroupIds: ["g1"] }));
    const result: any = await (c as any).getForGroup("g1", {}, {});
    expect(result.map((r: any) => r.form.id)).toEqual(["linked", "closed", "camp"]);
    expect(result[0].submissions[0].answers[0].value).toBe("12");
    expect(result[2].event).toEqual({ id: "e1", title: "Men's retreat", start: undefined });
    expect(result[2].submissions.map((s: any) => s.id)).toEqual(["s2"]);
    expect(result[2].submissions[0].personName).toBe("Donald Clark");
  });

  it("refuses a plain member", async () => {
    const c = wire(new FormSubmissionController(), au({ groupIds: ["g1"] }));
    const result: any = await (c as any).getForGroup("g1", {}, {});
    expect(result.status).toBe(401);
  });
});
