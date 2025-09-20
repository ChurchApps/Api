import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Customer } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class CustomerRepo extends ConfiguredRepo<Customer> {
  protected get repoConfig(): RepoConfig<Customer> {
    return {
      tableName: "customers",
      hasSoftDelete: false,
      idColumn: "id", // Note: Customer uses external ID, not auto-generated
      columns: ["personId", "provider", "metadata"]
    };
  }

  // Override create to use the external ID provided
  protected async create(model: Customer): Promise<Customer> {
    // Customer ID comes from external system, don't auto-generate
    const sql = "INSERT INTO customers (id, churchId, personId, provider, metadata) VALUES (?, ?, ?, ?, ?);";
    const provider = model.provider ?? "stripe";
    const metadata = model.metadata ? JSON.stringify(model.metadata) : null;
    const params = [model.id, model.churchId, model.personId, provider, metadata];
    await TypedDB.query(sql, params);
    return model;
  }

  // Override save method to handle external IDs properly
  public async save(model: Customer): Promise<Customer> {
    // Check if customer already exists in database
    const existing = await this.loadByPersonId(model.churchId!, model.personId!);

    if (existing) {
      // Customer exists, update it
      if (!model.id) model.id = existing.id;
      return await this.update(model);
    } else {
      // Customer doesn't exist, create it
      return await this.create(model);
    }
  }

  // Override update since we likely won't update customers
  protected async update(model: Customer): Promise<Customer> {
    // Customers typically don't get updated, but provide implementation for completeness
    const sql = "UPDATE customers SET personId=?, provider=?, metadata=? WHERE id=? AND churchId=?";
    const provider = model.provider ?? "stripe";
    const metadata = model.metadata ? JSON.stringify(model.metadata) : null;
    const params = [model.personId, provider, metadata, model.id, model.churchId];
    await TypedDB.query(sql, params);
    return model;
  }

  public async loadByPersonId(churchId: string, personId: string) {
    const row = await TypedDB.queryOne("SELECT * FROM customers WHERE personId=? AND churchId=?;", [personId, churchId]);
    return row ? this.rowToModel(row) : null;
  }

  protected rowToModel(row: any): Customer {
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
