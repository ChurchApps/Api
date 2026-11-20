import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "fund_generated" } }));

import { getDb } from "../../db/index";
import { FundRepo } from "../FundRepo";

const mockedGetDb = getDb as jest.Mock;
type WhereChain = { where: () => WhereChain; execute: () => Promise<void> };

describe("FundRepo visible flag persistence", () => {
  afterEach(() => jest.restoreAllMocks());

  it("includes visible in the insert values on create", async () => {
    const values = jest.fn().mockReturnValue({ execute: () => Promise.resolve() });
    mockedGetDb.mockReturnValue({ insertInto: () => ({ values }) });

    const repo = new FundRepo();
    await repo.save({ churchId: "C1", name: "Missions", visible: false });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ visible: false }));
  });

  it("includes visible in the update values on update", async () => {
    const whereChain: WhereChain = { where: () => whereChain, execute: () => Promise.resolve() };
    const set = jest.fn().mockReturnValue(whereChain);
    mockedGetDb.mockReturnValue({ updateTable: () => ({ set }) });

    const repo = new FundRepo();
    await repo.save({ id: "fund_1", churchId: "C1", name: "Missions", visible: false });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ visible: false }));
  });
});
