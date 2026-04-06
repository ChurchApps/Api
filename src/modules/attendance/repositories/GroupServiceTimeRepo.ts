import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { GroupServiceTime } from "../models/index.js";

@injectable()
export class GroupServiceTimeRepo {
  public async save(model: GroupServiceTime) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: GroupServiceTime): Promise<GroupServiceTime> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("groupServiceTimes").values({
      id: model.id,
      churchId: model.churchId,
      groupId: model.groupId,
      serviceTimeId: model.serviceTimeId
    }).execute();
    return model;
  }

  private async update(model: GroupServiceTime): Promise<GroupServiceTime> {
    await getDb().updateTable("groupServiceTimes").set({
      groupId: model.groupId,
      serviceTimeId: model.serviceTimeId
    }).where("id", "=", model.id)
      .where("churchId", "=", model.churchId)
      .execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("groupServiceTimes").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("groupServiceTimes").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("groupServiceTimes").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadWithServiceNames(churchId: string, groupId: string) {
    const rows = await sql<any>`SELECT gst.*, concat(c.name, ' - ', s.name, ' - ', st.name) as serviceTimeName FROM groupServiceTimes gst INNER JOIN serviceTimes st on st.id = gst.serviceTimeId INNER JOIN services s on s.id = st.serviceId INNER JOIN campuses c on c.id = s.campusId WHERE gst.churchId=${churchId} AND gst.groupId=${groupId}`.execute(getDb());
    return rows.rows.map((row: any) => this.rowToModel(row));
  }

  public async loadByServiceTimeIds(churchId: string, serviceTimeIds: string[]) {
    if (serviceTimeIds.length === 0) return [];
    return getDb().selectFrom("groupServiceTimes").selectAll()
      .where("churchId", "=", churchId)
      .where("serviceTimeId", "in", serviceTimeIds)
      .execute();
  }

  public convertToModel(_churchId: string, data: any): GroupServiceTime {
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]): GroupServiceTime[] {
    return data.map((row) => this.rowToModel(row));
  }

  protected rowToModel(row: any): GroupServiceTime {
    const result: GroupServiceTime = { id: row.id, groupId: row.groupId, serviceTimeId: row.serviceTimeId };
    if (row.serviceTimeName !== undefined) result.serviceTime = { id: result.serviceTimeId, name: row.serviceTimeName };
    return result;
  }
}
