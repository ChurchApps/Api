import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { GroupServiceTime } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { ConfiguredRepository } from "../../../shared/repositories/ConfiguredRepository";

@injectable()
export class GroupServiceTimeRepository extends ConfiguredRepository<GroupServiceTime> {
  public constructor() {
    super("groupServiceTimes", [
      { name: "id", type: "string", primaryKey: true },
      { name: "churchId", type: "string" },
      { name: "groupId", type: "string" },
      { name: "serviceTimeId", type: "string" }
    ]);
  }

  public loadWithServiceNames(churchId: string, groupId: string) {
    const sql =
      "SELECT gst.*, concat(c.name, ' - ', s.name, ' - ', st.name) as serviceTimeName" +
      " FROM groupServiceTimes gst" +
      " INNER JOIN serviceTimes st on st.id = gst.serviceTimeId" +
      " INNER JOIN services s on s.id = st.serviceId" +
      " INNER JOIN campuses c on c.id = s.campusId" +
      " WHERE gst.churchId=? AND gst.groupId=?";
    return DB.query(sql, [churchId, groupId]);
  }

  public loadByServiceTimeIds(churchId: string, serviceTimeIds: string[]) {
    const sql = "SELECT * FROM groupServiceTimes WHERE churchId=? AND serviceTimeId IN (" + serviceTimeIds.join(",") + ")";
    return DB.query(sql, [churchId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: GroupServiceTime = { id: data.id, groupId: data.groupId, serviceTimeId: data.serviceTimeId };
    if (data.serviceTimeName !== undefined) result.serviceTime = { id: result.serviceTimeId, name: data.serviceTimeName };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<GroupServiceTime>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
