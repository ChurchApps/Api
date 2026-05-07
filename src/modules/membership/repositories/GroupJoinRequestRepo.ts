import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GroupJoinRequest } from "../models/index.js";
import { PersonHelper } from "../helpers/index.js";

@injectable()
export class GroupJoinRequestRepo {
  public async save(model: GroupJoinRequest) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: GroupJoinRequest): Promise<GroupJoinRequest> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("groupJoinRequests").values({
      id: model.id,
      churchId: model.churchId,
      groupId: model.groupId,
      personId: model.personId,
      message: model.message ?? null,
      requestDate: sql`NOW()` as any,
      status: model.status ?? "pending",
      decidedBy: model.decidedBy ?? null,
      decidedDate: model.decidedDate ?? null,
      declineReason: model.declineReason ?? null
    }).execute();
    return model;
  }

  private async update(model: GroupJoinRequest): Promise<GroupJoinRequest> {
    await getDb().updateTable("groupJoinRequests").set({
      status: model.status,
      decidedBy: model.decidedBy ?? null,
      decidedDate: model.decidedDate ?? null,
      declineReason: model.declineReason ?? null
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("groupJoinRequests").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("groupJoinRequests").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadPendingForGroup(churchId: string, groupId: string) {
    return getDb().selectFrom("groupJoinRequests as r")
      .innerJoin("people as p", "p.id", "r.personId")
      .selectAll("r")
      .select(["p.photoUpdated", "p.displayName", "p.email"])
      .where("r.churchId", "=", churchId)
      .where("r.groupId", "=", groupId)
      .where("r.status", "=", "pending")
      .orderBy("r.requestDate", "asc")
      .execute();
  }

  public async loadPendingForChurch(churchId: string) {
    return getDb().selectFrom("groupJoinRequests as r")
      .innerJoin("people as p", "p.id", "r.personId")
      .innerJoin("groups as g", "g.id", "r.groupId")
      .selectAll("r")
      .select(["p.photoUpdated", "p.displayName", "p.email"])
      .select(["g.name as groupName"])
      .where("r.churchId", "=", churchId)
      .where("r.status", "=", "pending")
      .orderBy("r.requestDate", "asc")
      .execute();
  }

  public async loadForPerson(churchId: string, personId: string) {
    return getDb().selectFrom("groupJoinRequests as r")
      .innerJoin("groups as g", "g.id", "r.groupId")
      .selectAll("r")
      .select(["g.name as groupName"])
      .where("r.churchId", "=", churchId)
      .where("r.personId", "=", personId)
      .orderBy("r.requestDate", "desc")
      .execute();
  }

  public async loadExistingPending(churchId: string, groupId: string, personId: string) {
    return (await getDb().selectFrom("groupJoinRequests").selectAll()
      .where("churchId", "=", churchId)
      .where("groupId", "=", groupId)
      .where("personId", "=", personId)
      .where("status", "=", "pending")
      .executeTakeFirst()) ?? null;
  }

  protected rowToModel(row: any): GroupJoinRequest {
    const result: GroupJoinRequest = {
      id: row.id,
      churchId: row.churchId,
      groupId: row.groupId,
      personId: row.personId,
      message: row.message,
      requestDate: row.requestDate,
      status: row.status,
      decidedBy: row.decidedBy,
      decidedDate: row.decidedDate,
      declineReason: row.declineReason
    };
    if (row.displayName !== undefined) {
      result.person = {
        id: result.personId,
        photoUpdated: row.photoUpdated,
        name: { display: row.displayName },
        contactInfo: { email: row.email }
      };
      result.person.photo = PersonHelper.getPhotoPath(row.churchId, result.person);
    }
    if (row.groupName !== undefined) result.group = { id: result.groupId, name: row.groupName };
    return result;
  }

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }
}
