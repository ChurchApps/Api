import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { forms: { admin: "formsAdmin", edit: "formsEdit" } }
}));
jest.mock("../../models/index", () => ({}));

import { FormController } from "../FormController.js";

function formController(opts: any = {}) {
  const repos: any = {
    form: {
      save: jest.fn(async (f: any) => { if (!f.id) f.id = "genF"; return f; }),
      convertAllToModel: (_c: string, arr: any[]) => arr
    },
    memberPermission: { save: jest.fn(async (p: any) => p) }
  };
  const au = { churchId: "c1", id: "u1", personId: opts.personId ?? "p1", checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new FormController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (controller as any).formAccess = jest.fn(async () => opts.formAccess ?? false);
  return { controller, repos };
}

describe("FormController.save authorization", () => {
  it("blocks create without forms.admin or forms.edit (401, nothing saved)", async () => {
    const { controller, repos } = formController({ access: [] });
    const result: any = await (controller as any).save({ body: [{ name: "Visitor Card" }] }, {});
    expect(result.status).toBe(401);
    expect(repos.form.save).not.toHaveBeenCalled();
  });

  it("allows create with forms.edit", async () => {
    const { controller, repos } = formController({ access: ["formsEdit"] });
    await (controller as any).save({ body: [{ name: "Visitor Card" }] }, {});
    expect(repos.form.save).toHaveBeenCalledTimes(1);
    expect(repos.form.save.mock.calls[0][0].churchId).toBe("c1");
  });

  it("allows create with forms.admin", async () => {
    const { controller, repos } = formController({ access: ["formsAdmin"] });
    await (controller as any).save({ body: [{ name: "Visitor Card" }] }, {});
    expect(repos.form.save).toHaveBeenCalledTimes(1);
  });

  it("allows update when formAccess is true even without forms.edit", async () => {
    const { controller, repos } = formController({ access: [], formAccess: true });
    await (controller as any).save({ body: [{ id: "f1", name: "Updated" }] }, {});
    expect(repos.form.save).toHaveBeenCalledTimes(1);
  });

  it("blocks update when formAccess is false", async () => {
    const { controller, repos } = formController({ access: [], formAccess: false });
    const result: any = await (controller as any).save({ body: [{ id: "f1", name: "Updated" }] }, {});
    expect(result.status).toBe(401);
    expect(repos.form.save).not.toHaveBeenCalled();
  });
});
