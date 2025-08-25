import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Fund } from "../models";

@injectable()
export class FundRepository {
  public async getOrCreateGeneral(churchId: string) {
    const data = await DB.queryOne("SELECT * FROM funds WHERE churchId=? AND name='(General Fund)' AND removed=0;", [churchId]);

    if (data !== null) return this.convertToModel(churchId, data);
    else {
      const fund: Fund = { churchId, name: "(General Fund)" };
      const result = await this.save(fund);
      return result;
    }
  }

  public save(fund: Fund) {
    return fund.id ? this.update(fund) : this.create(fund);
  }

  private async create(fund: Fund) {
    fund.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO funds (id, churchId, name, taxDeductible, productId, removed) VALUES (?, ?, ?, ?, ?, 0);";
    const params = [fund.id, fund.churchId, fund.name, fund.taxDeductible, fund.productId];
    await DB.query(sql, params);
    return fund;
  }

  private async update(fund: Fund) {
    const sql = "UPDATE funds SET name=?, taxDeductible=?, productId=? WHERE id=? and churchId=?";
    const params = [fund.name, fund.taxDeductible, fund.productId, fund.id, fund.churchId];
    await DB.query(sql, params);
    return fund;
  }

  public delete(churchId: string, id: string) {
    return DB.query("UPDATE funds SET removed=1 WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM funds WHERE id=? AND churchId=? AND removed=0;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM funds WHERE churchId=? AND removed=0 ORDER BY name;", [churchId]);
  }

  public convertToModel(churchId: string, data: any) {
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
    const result: Fund[] = [];
    data.forEach((d) => result.push(this.convertToModel(churchId, d)));
    return result;
  }
}
