import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
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
