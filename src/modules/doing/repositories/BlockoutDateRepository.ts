import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { BlockoutDate } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { ConfiguredRepository } from "../../../shared/repositories/ConfiguredRepository";

@injectable()
export class BlockoutDateRepository extends ConfiguredRepository<BlockoutDate> {
  public constructor() {
    super("blockoutDates", [
      { name: "id", type: "string", primaryKey: true },
      { name: "churchId", type: "string" },
      { name: "personId", type: "string" },
      { name: "startDate", type: "date" },
      { name: "endDate", type: "date" }
    ]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM blockoutDates WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadForPerson(churchId: string, personId: string) {
    return DB.query("SELECT * FROM blockoutDates WHERE churchId=? and personId=?;", [churchId, personId]);
  }

  public loadUpcoming(churchId: string) {
    return DB.query("SELECT * FROM blockoutDates WHERE churchId=? AND endDate>NOW();", [churchId]);
  }

  public convertToModel(churchId: string, data: any): BlockoutDate {
    const result: BlockoutDate = {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      startDate: data.startDate,
      endDate: data.endDate
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any): BlockoutDate[] {
    return CollectionHelper.convertAll<BlockoutDate>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
