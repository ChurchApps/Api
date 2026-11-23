import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "fund_generated" } }));

import { getDb } from "../../db/index";
import { FundRepo, FUND_DESCRIPTION_MAX, cleanFundDescription } from "../FundRepo";

const mockedGetDb = getDb as jest.Mock;
type WhereChain = { where: () => WhereChain; execute: () => Promise<void> };

describe("FundRepo description", () => {
  afterEach(() => jest.restoreAllMocks());

  it("saves a trimmed description on create", async () => {
    const values = jest.fn().mockReturnValue({ execute: () => Promise.resolve() });
    mockedGetDb.mockReturnValue({ insertInto: () => ({ values }) });

    const result = await new FundRepo().save({ churchId: "C1", name: "Missions", description: "  Supports our partners overseas.  " });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ description: "Supports our partners overseas." }));
    expect(result.description).toBe("Supports our partners overseas.");
  });

  it("caps the description at the column size on update", async () => {
    const whereChain: WhereChain = { where: () => whereChain, execute: () => Promise.resolve() };
    const set = jest.fn().mockReturnValue(whereChain);
    mockedGetDb.mockReturnValue({ updateTable: () => ({ set }) });

    await new FundRepo().save({ id: "fund_1", churchId: "C1", name: "Missions", description: "x".repeat(FUND_DESCRIPTION_MAX + 50) });

    expect(set.mock.calls[0][0].description).toHaveLength(FUND_DESCRIPTION_MAX);
  });

  it("stores null when the description is blank or not text", () => {
    expect(cleanFundDescription("   ")).toBeNull();
    expect(cleanFundDescription(undefined)).toBeNull();
    expect(cleanFundDescription(42)).toBeNull();
  });

  it("returns the description from the public fund list", () => {
    const funds = new FundRepo().convertAllToModel("C1", [
      { id: "f1", churchId: "C1", name: "Building", description: "New roof", visible: true },
      { id: "f2", churchId: "C1", name: "General", visible: true }
    ]);
    expect(funds[0].description).toBe("New roof");
    expect(funds[1].description).toBeNull();
  });
});
