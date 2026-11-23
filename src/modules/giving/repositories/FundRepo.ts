import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Fund } from "../models/index.js";

// Shown to donors under the fund name; plain text, so it is only trimmed and capped to the column size.
export const FUND_DESCRIPTION_MAX = 500;

export function cleanFundDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, FUND_DESCRIPTION_MAX);
  return trimmed || null;
}

@injectable()
export class FundRepo {

  public async save(model: Fund) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(fund: Fund): Promise<Fund> {
    fund.id = UniqueIdHelper.shortId();
    fund.description = cleanFundDescription(fund.description);
    await getDb().insertInto("funds").values({
      id: fund.id,
      churchId: fund.churchId,
      name: fund.name,
      description: fund.description,
      taxDeductible: fund.taxDeductible,
      productId: fund.productId,
      visible: fund.visible ?? true,
      removed: false
    }).execute();
    return fund;
  }

  private async update(fund: Fund): Promise<Fund> {
    fund.description = cleanFundDescription(fund.description);
    await getDb().updateTable("funds").set({
      name: fund.name,
      description: fund.description,
      taxDeductible: fund.taxDeductible,
      productId: fund.productId,
      visible: fund.visible ?? true
    }).where("id", "=", fund.id).where("churchId", "=", fund.churchId).execute();
    return fund;
  }

  public async delete(churchId: string, id: string) {
    // Soft delete
    await getDb().updateTable("funds").set({ removed: true }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Fund | null> {
    return (await getDb().selectFrom("funds").selectAll().where("id", "=", id).where("churchId", "=", churchId).where(sql.ref("removed"), "=", false).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    const rows = await getDb().selectFrom("funds").selectAll()
      .where("churchId", "=", churchId)
      .where(sql.ref("removed"), "=", false)
      .orderBy("name")
      .execute();
    return rows.map((r) => this.rowToModel(r));
  }

  public async loadVisible(churchId: string) {
    const rows = await getDb().selectFrom("funds").selectAll()
      .where("churchId", "=", churchId)
      .where(sql.ref("removed"), "=", false)
      .where((eb) => eb.or([eb("visible", "=", true), eb("visible", "is", null)]))
      .orderBy("name")
      .execute();
    return rows.map((r) => this.rowToModel(r));
  }

  public async getOrCreateGeneral(churchId: string) {
    const data = (await getDb().selectFrom("funds").selectAll()
      .where("churchId", "=", churchId)
      .where("name", "=", "(General Fund)")
      .where(sql.ref("removed"), "=", false)
      .executeTakeFirst()) ?? null;

    if (data) return this.convertToModel(churchId, data);
    else {
      const fund: Fund = { churchId, name: "(General Fund)" };
      const result = await this.save(fund);
      return result;
    }
  }

  private rowToModel(data: Fund): Fund {
    return {
      id: data.id,
      name: data.name,
      description: data.description ?? null,
      churchId: data.churchId,
      productId: data.productId,
      taxDeductible: data.taxDeductible,
      visible: data.visible
    };
  }

  public convertToModel(_churchId: string, data: Fund) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: Fund[]) {
    return data.map((d) => this.rowToModel(d));
  }
}
