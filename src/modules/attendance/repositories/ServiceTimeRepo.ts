import { injectable } from "inversify";
import { ConfiguredRepo, type RepoConfig } from "../../../shared/infrastructure/index.js";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { ServiceTime } from "../models/index.js";

@injectable()
export class ServiceTimeRepo extends ConfiguredRepo<ServiceTime> {
  protected get repoConfig(): RepoConfig<ServiceTime> {
    return {
      tableName: "serviceTimes",
      hasSoftDelete: true,
      defaultOrderBy: "name",
      columns: ["serviceId", "name"],
      insertLiterals: { removed: "0" }
    };
  }

  public async loadNamesWithCampusService(churchId: string) {
    const result = await TypedDB.query(
      "SELECT st.*, concat(c.name, ' - ', s.name, ' - ', st.name) as longName FROM serviceTimes st INNER JOIN services s on s.Id=st.serviceId INNER JOIN campuses c on c.Id=s.campusId WHERE s.churchId=? AND st.removed=0 AND s.removed=0 AND c.removed=0 ORDER BY c.name, s.name, st.name;",
      [churchId]
    );
    return this.convertAllToModel(churchId, result);
  }

  public async loadNamesByServiceId(churchId: string, serviceId: string) {
    const result = await TypedDB.query(
      "SELECT st.*, concat(c.name, ' - ', s.name, ' - ', st.name) as longName FROM serviceTimes st INNER JOIN services s on s.id=st.serviceId INNER JOIN campuses c on c.id=s.campusId WHERE s.churchId=? AND s.id=? AND st.removed=0 ORDER BY c.name, s.name, st.name",
      [churchId, serviceId]
    );
    return this.convertAllToModel(churchId, result);
  }

  public async loadByChurchCampusService(churchId: string, campusId: string, serviceId: string) {
    const sql =
      "SELECT st.*" +
      " FROM serviceTimes st" +
      " LEFT OUTER JOIN services s on s.id=st.serviceId" +
      " WHERE st.churchId = ? AND (?=0 OR st.serviceId=?) AND (? = 0 OR s.campusId = ?) AND st.removed=0";
    const result = await TypedDB.query(sql, [churchId, serviceId, serviceId, campusId, campusId]);
    return this.convertAllToModel(churchId, result);
  }

  protected rowToModel(data: any): ServiceTime {
    const result: ServiceTime = { id: data.id, serviceId: data.serviceId, name: data.name, longName: data.longName };
    return result;
  }
}
