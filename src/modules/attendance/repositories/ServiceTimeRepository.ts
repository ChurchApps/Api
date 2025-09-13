import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { ServiceTime } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { UniqueIdHelper } from "../../../shared/helpers";

@injectable()
export class ServiceTimeRepository {
  public save(serviceTime: ServiceTime) {
    return serviceTime.id ? this.update(serviceTime) : this.create(serviceTime);
  }

  private async create(serviceTime: ServiceTime) {
    serviceTime.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO serviceTimes (id, churchId, serviceId, name, removed) VALUES (?, ?, ?, ?, 0);";
    const params = [serviceTime.id, serviceTime.churchId, serviceTime.serviceId, serviceTime.name];
    await DB.query(sql, params);
    return serviceTime;
  }

  private async update(serviceTime: ServiceTime) {
    const sql = "UPDATE serviceTimes SET serviceId=?, name=? WHERE id=? and churchId=?";
    const params = [serviceTime.serviceId, serviceTime.name, serviceTime.id, serviceTime.churchId];
    await DB.query(sql, params);
    return serviceTime;
  }

  public delete(churchId: string, id: string) {
    return DB.query("UPDATE serviceTimes SET removed=1 WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM serviceTimes WHERE id=? AND churchId=? AND removed=0;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM serviceTimes WHERE churchId=? AND removed=0;", [churchId]);
  }

  public loadNamesWithCampusService(churchId: string) {
    return DB.query(
      "SELECT st.*, concat(c.name, ' - ', s.name, ' - ', st.name) as longName FROM serviceTimes st INNER JOIN services s on s.Id=st.serviceId INNER JOIN campuses c on c.Id=s.campusId WHERE s.churchId=? AND st.removed=0 AND s.removed=0 AND c.removed=0 ORDER BY c.name, s.name, st.name;",
      [churchId]
    );
  }

  public loadNamesByServiceId(churchId: string, serviceId: string) {
    return DB.query(
      "SELECT st.*, concat(c.name, ' - ', s.name, ' - ', st.name) as longName FROM serviceTimes st INNER JOIN services s on s.id=st.serviceId INNER JOIN campuses c on c.id=s.campusId WHERE s.churchId=? AND s.id=? AND st.removed=0 ORDER BY c.name, s.name, st.name",
      [churchId, serviceId]
    );
  }

  public loadByChurchCampusService(churchId: string, campusId: string, serviceId: string) {
    const sql =
      "SELECT st.*" +
      " FROM serviceTimes st" +
      " LEFT OUTER JOIN services s on s.id=st.serviceId" +
      " WHERE st.churchId = ? AND (?=0 OR st.serviceId=?) AND (? = 0 OR s.campusId = ?) AND st.removed=0";
    return DB.query(sql, [churchId, serviceId, serviceId, campusId, campusId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: ServiceTime = { id: data.id, serviceId: data.serviceId, name: data.name, longName: data.longName };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<ServiceTime>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
