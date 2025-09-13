import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { GroupServiceTime } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { UniqueIdHelper } from "../../../shared/helpers";

@injectable()
export class GroupServiceTimeRepository {
  public save(groupServiceTime: GroupServiceTime) {
    return groupServiceTime.id ? this.update(groupServiceTime) : this.create(groupServiceTime);
  }

  private async create(groupServiceTime: GroupServiceTime) {
    groupServiceTime.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO groupServiceTimes (id, churchId, groupId, serviceTimeId) VALUES (?, ?, ?, ?);";
    const params = [groupServiceTime.id, groupServiceTime.churchId, groupServiceTime.groupId, groupServiceTime.serviceTimeId];
    await DB.query(sql, params);
    return groupServiceTime;
  }

  private async update(groupServiceTime: GroupServiceTime) {
    const sql = "UPDATE groupServiceTimes SET groupId=?, serviceTimeId=? WHERE id=? and churchId=?";
    const params = [groupServiceTime.groupId, groupServiceTime.serviceTimeId, groupServiceTime.id, groupServiceTime.churchId];
    await DB.query(sql, params);
    return groupServiceTime;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM groupServiceTimes WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM groupServiceTimes WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM groupServiceTimes WHERE churchId=?;", [churchId]);
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
