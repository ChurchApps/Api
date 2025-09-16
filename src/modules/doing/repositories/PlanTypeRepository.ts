import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { PlanType } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { ConfiguredRepository } from "../../../shared/repositories/ConfiguredRepository";

@injectable()
export class PlanTypeRepository extends ConfiguredRepository<PlanType> {
  public constructor() {
    super("planTypes", [
      { name: "id", type: "string", primaryKey: true },
      { name: "churchId", type: "string" },
      { name: "ministryId", type: "string" },
      { name: "name", type: "string" }
    ]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM planTypes WHERE churchId=? and id in (?);", [churchId, ids]);
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
