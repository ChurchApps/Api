import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Customer } from "../models";

@injectable()
export class CustomerRepository {
  public async save(customer: Customer) {
    return this.create(customer);
  }

  private async create(customer: Customer) {
    return DB.query("INSERT INTO customers (id, churchId, personId) VALUES (?, ?, ?);", [customer.id, customer.churchId, customer.personId]).then(() => {
      return customer;
    });
  }

  public async delete(churchId: string, id: string) {
    DB.query("DELETE FROM customers WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM customers WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async loadByPersonId(churchId: string, personId: string) {
    return DB.queryOne("SELECT * FROM customers WHERE personId=? AND churchId=?;", [personId, churchId]);
  }

  public async loadAll(churchId: string) {
    return DB.query("SELECT * FROM customers WHERE churchId=?;", [churchId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Customer = { id: data.id, churchId, personId: data.personId };
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    const result: any[] = [];
    data.forEach((d) => result.push(this.convertToModel(churchId, d)));
    return result;
  }
}
