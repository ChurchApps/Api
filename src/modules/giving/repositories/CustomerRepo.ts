import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { Customer } from "../models/index.js";

@injectable()
export class CustomerRepo {

  public async save(model: Customer): Promise<Customer> {
    // Check if customer already exists in database
    const existing = await this.loadByPersonId(model.churchId!, model.personId!);

    if (existing) {
      // Customer exists - update with new Stripe customer ID if provided
      const oldId = existing.id;
      const newId = model.id || existing.id;

      if (newId !== oldId) {
        // If the customer ID changed (new Stripe customer), delete old and create new
        await this.delete(model.churchId!, oldId!);
        return await this.create(model);
      } else {
        // Same ID, just update other fields
        model.id = existing.id;
        return await this.update(model);
      }
    } else {
      // Customer doesn't exist, create it
      return await this.create(model);
    }
  }

  // Customer ID comes from external system, don't auto-generate
  private async create(model: Customer): Promise<Customer> {
    const provider = model.provider ?? "stripe";
    const metadata = model.metadata ? JSON.stringify(model.metadata) : null;
    await getDb().insertInto("customers").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      provider,
      metadata
    } as any).execute();
    return model;
  }

  private async update(model: Customer): Promise<Customer> {
    const provider = model.provider ?? "stripe";
    const metadata = model.metadata ? JSON.stringify(model.metadata) : null;
    await getDb().updateTable("customers").set({
      personId: model.personId,
      provider,
      metadata
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string): Promise<void> {
    await getDb().deleteFrom("customers").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    const row = (await getDb().selectFrom("customers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
    return row ? this.rowToModel(row) : null;
  }

  public async loadAll(churchId: string) {
    const rows = await getDb().selectFrom("customers").selectAll().where("churchId", "=", churchId).execute();
    return rows.map(r => this.rowToModel(r));
  }

  public async loadByPersonId(churchId: string, personId: string) {
    const row = (await getDb().selectFrom("customers").selectAll().where("personId", "=", personId).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
    return row ? this.rowToModel(row) : null;
  }

  public async loadByPersonAndProvider(churchId: string, personId: string, provider: string) {
    const row = (await getDb().selectFrom("customers").selectAll()
      .where("personId", "=", personId)
      .where("churchId", "=", churchId)
      .where("provider", "=", provider)
      .executeTakeFirst()) ?? null;
    return row ? this.rowToModel(row) : null;
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }

  private rowToModel(row: any): Customer {
    return {
      id: row.id,
      churchId: row.churchId,
      personId: row.personId,
      provider: row.provider,
      metadata: this.parseJson(row.metadata)
    };
  }

  private parseJson(value: unknown) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value as Record<string, unknown>;
  }
}
