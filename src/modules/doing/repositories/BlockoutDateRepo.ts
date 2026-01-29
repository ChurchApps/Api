import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { BlockoutDate } from "../models/index.js";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class BlockoutDateRepo extends ConfiguredRepo<BlockoutDate> {
  protected get repoConfig(): RepoConfig<BlockoutDate> {
    return {
      tableName: "blockoutDates",
      hasSoftDelete: false,
      columns: ["personId", "startDate", "endDate"]
    };
  }

  public save(blockoutDate: BlockoutDate) {
    // Convert date-only fields before saving
    const processedData = { ...blockoutDate };
    if (processedData.startDate) {
      (processedData as any).startDate = DateHelper.toMysqlDateOnly(processedData.startDate);
    }
    if (processedData.endDate) {
      (processedData as any).endDate = DateHelper.toMysqlDateOnly(processedData.endDate);
    }
    return super.save(processedData);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return TypedDB.query("SELECT * FROM blockoutDates WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadForPerson(churchId: string, personId: string) {
    return TypedDB.query("SELECT * FROM blockoutDates WHERE churchId=? and personId=?;", [churchId, personId]);
  }

  public loadUpcoming(churchId: string) {
    return TypedDB.query("SELECT * FROM blockoutDates WHERE churchId=? AND endDate>NOW();", [churchId]);
  }

  protected rowToModel(row: any): BlockoutDate {
    return {
      id: row.id,
      churchId: row.churchId,
      personId: row.personId,
      startDate: row.startDate,
      endDate: row.endDate
    };
  }
}
