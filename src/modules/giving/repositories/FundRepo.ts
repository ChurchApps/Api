import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { funds } from "../../../db/schema/giving.js";
import { Fund } from "../models/index.js";

@injectable()
export class FundRepo extends DrizzleRepo<typeof funds> {
  protected readonly table = funds;
  protected readonly moduleName = "giving";
  protected readonly softDelete = true;

  public async getOrCreateGeneral(churchId: string) {
    const row = await this.db.select().from(funds)
      .where(and(eq(funds.churchId, churchId), eq(funds.name, "(General Fund)"), eq(funds.removed, false)))
      .then(r => r[0] ?? null);

    if (row !== null) return this.convertToModel(churchId, row);
    else {
      const fund: Fund = { churchId, name: "(General Fund)" };
      const result = await this.save(fund);
      return result;
    }
  }

  public convertToModel(_churchId: string, data: any): Fund {
    const result: Fund = {
      id: data.id,
      name: data.name,
      churchId: data.churchId,
      productId: data.productId,
      taxDeductible: data.taxDeductible
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
