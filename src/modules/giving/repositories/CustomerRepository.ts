import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Customer } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class CustomerRepository extends ConfiguredRepository<Customer> {
  protected get repoConfig(): RepoConfig<Customer> {
    return {
      tableName: "customers",
      hasSoftDelete: false,
      idColumn: "id", // Note: Customer uses external ID, not auto-generated
      insertColumns: ["personId"],
      updateColumns: ["personId"]
    };
  }

  // Override create to use the external ID provided
  protected async create(model: Customer): Promise<Customer> {
    // Customer ID comes from external system, don't auto-generate
    const sql = "INSERT INTO customers (id, churchId, personId) VALUES (?, ?, ?);";
    const params = [model.id, model.churchId, model.personId];
    await DB.query(sql, params);
    return model;
  }

  // Override update since we likely won't update customers
  protected async update(model: Customer): Promise<Customer> {
    // Customers typically don't get updated, but provide implementation for completeness
    const sql = "UPDATE customers SET personId=? WHERE id=? AND churchId=?";
    const params = [model.personId, model.id, model.churchId];
    await DB.query(sql, params);
    return model;
  }

  public async loadByPersonId(churchId: string, personId: string) {
    return DB.queryOne("SELECT * FROM customers WHERE personId=? AND churchId=?;", [personId, churchId]);
  }

  protected rowToModel(row: any): Customer {
    return { id: row.id, churchId: row.churchId, personId: row.personId };
  }
}
