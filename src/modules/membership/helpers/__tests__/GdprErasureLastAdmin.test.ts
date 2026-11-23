const execute = jest.fn(async (): Promise<unknown[]> => []);
const executeTakeFirst = jest.fn(async (): Promise<null> => null);
const chain: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === "execute") return execute;
    if (prop === "executeTakeFirst") return executeTakeFirst;
    if (prop === "then") return undefined;
    return () => chain;
  }
});
jest.mock("../../../../shared/infrastructure/KyselyPool.js", () => ({ KyselyPool: { getDb: () => chain } }));
jest.mock("@churchapps/apihelper", () => ({ FileStorageHelper: { remove: jest.fn() } }));

import { GdprErasureHelper } from "../GdprErasureHelper.js";

function repos(sole: boolean) {
  return { roleMember: { isSoleDomainAdmin: jest.fn(async () => sole), deleteSelf: jest.fn() }, user: { delete: jest.fn() } };
}

describe("GdprErasureHelper.anonymize and the last Domain Admin (#1627)", () => {
  beforeEach(() => { execute.mockClear(); });

  it("refuses to erase the church's only Domain Admin and changes nothing", async () => {
    const r = repos(true);
    await expect(GdprErasureHelper.anonymize("c1", "p1", "u1", r)).rejects.toThrow(/only Domain Admin/);
    expect(execute).not.toHaveBeenCalled();
    expect(r.roleMember.deleteSelf).not.toHaveBeenCalled();
  });

  it("erases a Domain Admin when another one remains", async () => {
    const r = repos(false);
    await GdprErasureHelper.anonymize("c1", "p1", "u1", r);
    expect(r.roleMember.isSoleDomainAdmin).toHaveBeenCalledWith("c1", "u1");
    expect(r.roleMember.deleteSelf).toHaveBeenCalledWith("c1", "u1");
  });
});
