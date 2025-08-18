import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Service } from "../models";
import { UniqueIdHelper } from "../../../shared/helpers";

@injectable()
export class ServiceRepository {
  public save(service: Service) {
    return service.id ? this.update(service) : this.create(service);
  }

  private async create(service: Service) {
    service.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO services (id, churchId, campusId, name, removed) VALUES (?, ?, ?, ?, 0);";
    const params = [service.id, service.churchId, service.campusId, service.name];
    await DB.query(sql, params);
    return service;
  }

  private async update(service: Service) {
    const sql = "UPDATE services SET campusId=?, name=? WHERE id=? and churchId=?";
    const params = [service.campusId, service.name, service.id, service.churchId];
    await DB.query(sql, params);
    return service;
  }

  public delete(churchId: string, id: string) {
    return DB.query("UPDATE services SET removed=1 WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM services WHERE id=? AND churchId=? AND removed=0;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM services WHERE churchId=? AND removed=0;", [churchId]);
  }

  public loadWithCampus(churchId: string) {
    return DB.query(
      "SELECT s.*, c.name as campusName FROM services s INNER JOIN campuses c on c.id=s.campusId WHERE s.churchId=? AND s.removed=0 and c.removed=0 ORDER BY c.name, s.name",
      [churchId]
    );
  }

  public searchByCampus(churchId: string, campusId: string) {
    return DB.query("SELECT * FROM services WHERE churchId=? AND (?=0 OR CampusId=?) AND removed=0 ORDER by name;", [
      churchId,
      campusId,
      campusId
    ]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Service = { id: data.id, campusId: data.campusId, name: data.name };
    if (data.campusName !== undefined) result.campus = { id: result.campusId, name: data.campusName };
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    const result: Service[] = [];
    data.forEach((d) => result.push(this.convertToModel(churchId, d)));
    return result;
  }
}
