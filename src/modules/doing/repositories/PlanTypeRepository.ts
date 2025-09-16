import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { PlanType } from "../models";

import { CollectionHelper } from "../../../shared/helpers";

@injectable()
export class PlanTypeRepository {
  public save(planType: PlanType) {
    return planType.id ? this.update(planType) : this.create(planType);
  }

  private async create(planType: PlanType) {
    planType.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO planTypes (id, churchId, ministryId, name) VALUES (?, ?, ?, ?);";
    const params = [planType.id, planType.churchId, planType.ministryId, planType.name];
    await DB.query(sql, params);
    return planType;
  }

  private async update(planType: PlanType) {
    const sql = "UPDATE planTypes SET ministryId=?, name=? WHERE id=? and churchId=?";
    const params = [planType.ministryId, planType.name, planType.id, planType.churchId];
    await DB.query(sql, params);
    return planType;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM planTypes WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM planTypes WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM planTypes WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM planTypes WHERE churchId=?;", [churchId]);
  }

  public loadByMinistryId(churchId: string, ministryId: string) {
    return DB.query("SELECT * FROM planTypes WHERE churchId=? AND ministryId=?;", [churchId, ministryId]);
  }

  public convertToModel(churchId: string, data: any): PlanType {
    const result: PlanType = {
      id: data.id,
      churchId: data.churchId,
      ministryId: data.ministryId,
      name: data.name
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any): PlanType[] {
    return CollectionHelper.convertAll<PlanType>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
