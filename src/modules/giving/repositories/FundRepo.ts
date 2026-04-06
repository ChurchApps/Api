import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Fund } from "../models/index.js";

@injectable()
export class FundRepo {

  public async save(model: Fund) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(fund: Fund): Promise<Fund> {
    fund.id = UniqueIdHelper.shortId();
    await getDb().insertInto("funds").values({
      id: fund.id,
      churchId: fund.churchId,
      name: fund.name,
      taxDeductible: fund.taxDeductible,
      productId: fund.productId,
      removed: false
    } as any).execute();
    return fund;
  }

  private async update(fund: Fund): Promise<Fund> {
    await getDb().updateTable("funds").set({
      name: fund.name,
      taxDeductible: fund.taxDeductible,
      productId: fund.productId
    } as any).where("id", "=", fund.id).where("churchId", "=", fund.churchId).execute();
    return fund;
  }

  public async delete(churchId: string, id: string) {
    // Soft delete
    await getDb().updateTable("funds").set({ removed: true } as any).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await (getDb().selectFrom("funds").selectAll().where("id", "=", id).where("churchId", "=", churchId) as any).where(sql.ref("removed"), "=", false).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    const rows = await (getDb().selectFrom("funds").selectAll()
      .where("churchId", "=", churchId) as any)
      .where(sql.ref("removed"), "=", false)
      .orderBy("name")
      .execute();
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async getOrCreateGeneral(churchId: string) {
    const data = (await (getDb().selectFrom("funds").selectAll()
      .where("churchId", "=", churchId)
      .where("name", "=", "(General Fund)") as any)
      .where(sql.ref("removed"), "=", false)
      .executeTakeFirst()) ?? null;

    if (data) return this.convertToModel(churchId, data);
    else {
      const fund: Fund = { churchId, name: "(General Fund)" };
      const result = await this.save(fund);
      return result;
    }
  }

  private rowToModel(data: any): Fund {
    return {
      id: data.id,
      name: data.name,
      churchId: data.churchId,
      productId: data.productId,
      taxDeductible: data.taxDeductible
    };
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
