import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { GroupServiceTime } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class GroupServiceTimeRepository extends ConfiguredRepository<GroupServiceTime> {
  protected get repoConfig(): RepoConfig<GroupServiceTime> {
    return {
      tableName: "groupServiceTimes",
      hasSoftDelete: false,
      columns: ["groupId", "serviceTimeId"]
    };
  }

  public loadWithServiceNames(churchId: string, groupId: string) {
    const sql =
      "SELECT gst.*, concat(c.name, ' - ', s.name, ' - ', st.name) as serviceTimeName" +
      " FROM groupServiceTimes gst" +
      " INNER JOIN serviceTimes st on st.id = gst.serviceTimeId" +
      " INNER JOIN services s on s.id = st.serviceId" +
      " INNER JOIN campuses c on c.id = s.campusId" +
      " WHERE gst.churchId=? AND gst.groupId=?";
    return TypedDB.query(sql, [churchId, groupId]);
  }

  public loadByServiceTimeIds(churchId: string, serviceTimeIds: string[]) {
    const sql = "SELECT * FROM groupServiceTimes WHERE churchId=? AND serviceTimeId IN (" + serviceTimeIds.join(",") + ")";
    return TypedDB.query(sql, [churchId]);
  }

  protected rowToModel(row: any): GroupServiceTime {
    const result: GroupServiceTime = { id: row.id, groupId: row.groupId, serviceTimeId: row.serviceTimeId };
    if (row.serviceTimeName !== undefined) result.serviceTime = { id: result.serviceTimeId, name: row.serviceTimeName };
    return result;
  }
}
