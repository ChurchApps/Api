import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { BlockoutDate } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class BlockoutDateRepository extends ConfiguredRepository<BlockoutDate> {
  protected get repoConfig(): RepoConfig<BlockoutDate> {
    return {
      tableName: "blockoutDates",
      hasSoftDelete: false,
      insertColumns: ["personId", "startDate", "endDate"],
      updateColumns: ["personId", "startDate", "endDate"]
    };
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
