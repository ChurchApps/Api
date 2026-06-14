import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));

import { CustomerRepo } from "../CustomerRepo";

// Regression guard for the multi-provider data-loss bug: save() must scope its
// existing-customer lookup by provider. Keying on personId alone let a second
// provider's customer save delete the first provider's customer row.
describe("CustomerRepo.save (provider-scoped customer keying)", () => {
  const makeRepo = () => {
    const repo = new CustomerRepo();
    jest.spyOn(repo as any, "create").mockImplementation(async (m: any) => m);
    jest.spyOn(repo as any, "update").mockImplementation(async (m: any) => m);
    jest.spyOn(repo as any, "delete").mockResolvedValue(undefined);
    jest.spyOn(repo, "loadByPersonId").mockResolvedValue(null as any);
    return repo;
  };

  afterEach(() => jest.restoreAllMocks());

  it("looks up the existing customer by person AND provider, never by person alone", async () => {
    const repo = makeRepo();
    const scoped = jest.spyOn(repo, "loadByPersonAndProvider").mockResolvedValue(null as any);
    await repo.save({ id: "ab_123", churchId: "C1", personId: "P1", provider: "kingdomfunding" } as any);
    expect(scoped).toHaveBeenCalledWith("C1", "P1", "kingdomfunding");
    expect(repo.loadByPersonId).not.toHaveBeenCalled();
  });

  it("creates a new row for a second provider instead of clobbering the first provider's customer", async () => {
    const repo = makeRepo();
    // The KingdomFunding customer doesn't exist yet (a Stripe one for the same
    // person is a different provider and must be left untouched).
    jest.spyOn(repo, "loadByPersonAndProvider").mockResolvedValue(null as any);
    await repo.save({ id: "ab_123", churchId: "C1", personId: "P1", provider: "kingdomfunding" } as any);
    expect((repo as any).create).toHaveBeenCalledTimes(1);
    expect((repo as any).delete).not.toHaveBeenCalled();
  });

  it("updates in place when the same provider's customer id already exists", async () => {
    const repo = makeRepo();
    jest.spyOn(repo, "loadByPersonAndProvider").mockResolvedValue({ id: "cus_s", churchId: "C1", personId: "P1", provider: "stripe" } as any);
    await repo.save({ id: "cus_s", churchId: "C1", personId: "P1", provider: "stripe" } as any);
    expect((repo as any).update).toHaveBeenCalledTimes(1);
    expect((repo as any).delete).not.toHaveBeenCalled();
  });

  it("replaces (delete + create) only when the provider matches but the external id changed", async () => {
    const repo = makeRepo();
    jest.spyOn(repo, "loadByPersonAndProvider").mockResolvedValue({ id: "old", churchId: "C1", personId: "P1", provider: "stripe" } as any);
    await repo.save({ id: "new", churchId: "C1", personId: "P1", provider: "stripe" } as any);
    expect((repo as any).delete).toHaveBeenCalledWith("C1", "old");
    expect((repo as any).create).toHaveBeenCalledTimes(1);
  });

  it("defaults the provider to stripe when unset (legacy callers)", async () => {
    const repo = makeRepo();
    const scoped = jest.spyOn(repo, "loadByPersonAndProvider").mockResolvedValue(null as any);
    await repo.save({ id: "cus_s", churchId: "C1", personId: "P1" } as any);
    expect(scoped).toHaveBeenCalledWith("C1", "P1", "stripe");
  });
});
