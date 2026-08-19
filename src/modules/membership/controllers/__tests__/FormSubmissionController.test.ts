import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { forms: { admin: "formsAdmin", edit: "formsEdit" } },
  Environment: { messagingApi: "http://msg", supportEmail: "s@t", b1AdminRoot: "http://b1" },
  ConversationalFormHelper: { extractContact: jest.fn(), findOrCreatePerson: jest.fn(), applyTokens: jest.fn() }
}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTransactional: jest.fn() } }));
jest.mock("axios", () => ({ post: jest.fn() }));

import { FormSubmissionController } from "../FormSubmissionController.js";
import { WebhookDispatcher } from "../../../../shared/webhooks/index.js";
import { ConversationalFormHelper } from "../../helpers/index.js";

function formSubmissionController(opts: any = {}) {
  const formRow = opts.form ?? { id: "f1", churchId: "c1", name: "Connect", restricted: false };
  const repos: any = {
    form: {
      access: jest.fn(async () => opts.formAccess === undefined ? formRow : opts.formAccess),
      convertToModel: (_c: string, data: any) => data
    },
    formSubmission: { save: jest.fn(async (s: any) => { if (!s.id) s.id = "sub1"; return s; }) },
    answer: { save: jest.fn(async (a: any) => a) },
    question: { loadForForm: jest.fn(async () => []), convertAllToModel: (_c: string, rows: any[]) => rows },
    memberPermission: { loadByEmailNotification: jest.fn(async () => []) },
    church: { loadById: jest.fn(async () => ({ id: "c1", name: "Test" })) },
    person: { loadByIds: jest.fn(async () => []) }
  };
  const au = opts.au ?? { churchId: opts.auChurchId, id: opts.auId, checkAccess: () => false };
  const controller = new FormSubmissionController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).formAccess = jest.fn(async () => opts.formAccessOk ?? false);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("FormSubmissionController.save churchId", () => {
  it("ignores a body churchId for another tenant and saves under the form church", async () => {
    const { controller, repos } = formSubmissionController({ auChurchId: "c1", auId: "u1" });
    const body = [{ formId: "f1", churchId: "otherChurch", answers: [{ questionId: "q1", value: "hi", churchId: "otherChurch" }] }];
    const result: any = await (controller as any).save({ body }, {});
    expect(repos.formSubmission.save).toHaveBeenCalledTimes(1);
    expect(repos.formSubmission.save.mock.calls[0][0].churchId).toBe("c1");
    expect(repos.answer.save.mock.calls[0][0].churchId).toBe("c1");
    expect(WebhookDispatcher.emit).toHaveBeenCalledWith("c1", "form.submission.created", expect.objectContaining({ churchId: "c1" }));
    expect(result[0].churchId).toBe("c1");
  });

  it("lets an anonymous caller submit a public form to the form church", async () => {
    const { controller, repos } = formSubmissionController({ au: { checkAccess: () => false } });
    const result: any = await (controller as any).save({ body: [{ formId: "f1" }] }, {});
    expect(repos.formSubmission.save).toHaveBeenCalledTimes(1);
    expect(repos.formSubmission.save.mock.calls[0][0].churchId).toBe("c1");
    expect(result[0].churchId).toBe("c1");
  });

  it("lets an authenticated other-church caller submit an unrestricted form under the form church", async () => {
    const { controller, repos } = formSubmissionController({ auChurchId: "otherChurch", auId: "u1" });
    const result: any = await (controller as any).save({ body: [{ formId: "f1", churchId: "otherChurch" }] }, {});
    expect(repos.formSubmission.save).toHaveBeenCalledTimes(1);
    expect(repos.formSubmission.save.mock.calls[0][0].churchId).toBe("c1");
    expect(result[0].churchId).toBe("c1");
  });

  it("rejects a missing form", async () => {
    const { controller, repos } = formSubmissionController({ formAccess: null });
    const result: any = await (controller as any).save({ body: [{ formId: "missing" }] }, {});
    expect(repos.formSubmission.save).not.toHaveBeenCalled();
    expect(result[0].error).toMatch(/not found/);
  });
});

describe("FormSubmissionController.save autoCreatePerson", () => {
  it("rewrites a pre-populated form contentType/contentId to the created person", async () => {
    (ConversationalFormHelper.extractContact as jest.Mock).mockReturnValueOnce({ firstName: "Al", email: "al@example.com" });
    (ConversationalFormHelper.findOrCreatePerson as jest.Mock).mockResolvedValueOnce({ id: "p1", name: { first: "Al" } });
    const { controller, repos } = formSubmissionController({ form: { id: "f1", churchId: "c1", name: "Connect", restricted: false, autoCreatePerson: true } });
    const body = [{ formId: "f1", contentType: "form", contentId: "f1", answers: [{ questionId: "q1", value: "al@example.com" }] }];
    await (controller as any).save({ body }, {});
    expect(ConversationalFormHelper.findOrCreatePerson).toHaveBeenCalledTimes(1);
    const saved = repos.formSubmission.save.mock.calls[0][0];
    expect(saved.contentType).toBe("person");
    expect(saved.contentId).toBe("p1");
  });
});
