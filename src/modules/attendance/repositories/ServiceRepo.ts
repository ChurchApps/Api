import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Service } from "../models/index.js";

@injectable()
export class ServiceRepo {
  public async save(model: Service) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Service): Promise<Service> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("services").values({
      id: model.id,
      churchId: model.churchId,
      campusId: model.campusId,
      name: model.name,
      removed: false
    }).execute();
    return model;
  }

  private async update(model: Service): Promise<Service> {
    await getDb().updateTable("services").set({
      campusId: model.campusId,
      name: model.name
    }).where("id", "=", model.id)
      .where("churchId", "=", model.churchId)
      .execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().updateTable("services").set({ removed: true }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("services").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("services").selectAll().where("churchId", "=", churchId).where("removed", "=", false).orderBy("name").execute();
  }

  public async loadWithCampus(churchId: string) {
    const rows = await sql<any>`SELECT s.*, c.name as campusName FROM services s INNER JOIN campuses c on c.id=s.campusId WHERE s.churchId=${churchId} AND s.removed=0 and c.removed=0 ORDER BY c.name, s.name`.execute(getDb());
    return rows.rows.map((row: any) => this.rowToModel(row));
  }

  public async searchByCampus(churchId: string, campusId: string) {
    const rows = await sql<any>`SELECT * FROM services WHERE churchId=${churchId} AND (${campusId}='0' OR campusId=${campusId}) AND removed=0 ORDER BY name`.execute(getDb());
    return rows.rows.map((row: any) => this.rowToModel(row));
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]): Service[] {
    return data.map((row) => this.rowToModel(row));
  }

  protected rowToModel(data: any): Service {
    const result: Service = { id: data.id, campusId: data.campusId, name: data.name };
    if (data.campusName !== undefined) result.campus = { id: result.campusId, name: data.campusName };
    return result;
  }
}
