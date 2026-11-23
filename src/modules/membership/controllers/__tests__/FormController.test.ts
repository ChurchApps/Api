import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { forms: { admin: "formsAdmin", edit: "formsEdit" } } }));
jest.mock("../../models/index", () => ({}));

import express from "express";
import { FormController } from "../FormController.js";
import { Form, MemberPermission } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
type FormControllerOpts = { personId?: string; access?: string[]; formAccess?: boolean };

const res = {} as express.Response;
const saveRequest = (body: Form[]) => ({ body }) as express.Request<{}, {}, Form[]>;

function formController(opts: FormControllerOpts = {}) {
  const repos = {
    form: {
      save: jest.fn(async (f: Form) => { if (!f.id) f.id = "genF"; return f; }),
      convertAllToModel: (_c: string, arr: Form[]) => arr
    },
    memberPermission: { save: jest.fn(async (p: MemberPermission) => p) }
  };
  const au = { churchId: "c1", id: "u1", personId: opts.personId ?? "p1", checkAccess: (perm: string) => (opts.access ?? []).includes(perm) };
  const controller = new FormController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status }),
    formAccess: jest.fn(async () => opts.formAccess ?? false)
  });
  return { controller, repos };
}

describe("FormController.save authorization", () => {
  it("blocks create without forms.admin or forms.edit (401, nothing saved)", async () => {
    const { controller, repos } = formController({ access: [] });
    const result = (await controller.save(saveRequest([{ name: "Visitor Card" }]), res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.form.save).not.toHaveBeenCalled();
  });

  it("allows create with forms.edit", async () => {
    const { controller, repos } = formController({ access: ["formsEdit"] });
    await controller.save(saveRequest([{ name: "Visitor Card" }]), res);
    expect(repos.form.save).toHaveBeenCalledTimes(1);
    expect(repos.form.save.mock.calls[0][0].churchId).toBe("c1");
  });

  it("allows create with forms.admin", async () => {
    const { controller, repos } = formController({ access: ["formsAdmin"] });
    await controller.save(saveRequest([{ name: "Visitor Card" }]), res);
    expect(repos.form.save).toHaveBeenCalledTimes(1);
  });

  it("allows update when formAccess is true even without forms.edit", async () => {
    const { controller, repos } = formController({ access: [], formAccess: true });
    await controller.save(saveRequest([{ id: "f1", name: "Updated" }]), res);
    expect(repos.form.save).toHaveBeenCalledTimes(1);
  });

  it("blocks update when formAccess is false", async () => {
    const { controller, repos } = formController({ access: [], formAccess: false });
    const result = (await controller.save(saveRequest([{ id: "f1", name: "Updated" }]), res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.form.save).not.toHaveBeenCalled();
  });
});
