import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Group } from "../models/index.js";

@injectable()
export class GroupRepo {
  public async save(group: Group) {
    this.convertFromModel(group);
    return group.id ? this.update(group) : this.create(group);
  }

  private async create(group: Group): Promise<Group> {
    group.id = UniqueIdHelper.shortId();
    this.convertFromModel(group);
    await getDb().insertInto("groups").values({
      id: group.id,
      churchId: group.churchId,
      categoryName: group.categoryName,
      name: group.name,
      trackAttendance: group.trackAttendance,
      parentPickup: group.parentPickup,
      printNametag: group.printNametag,
      about: group.about,
      photoUrl: group.photoUrl,
      tags: group.tags,
      meetingTime: group.meetingTime,
      meetingLocation: group.meetingLocation,
      labels: group.labels as any,
      slug: group.slug,
      removed: false as any
    }).execute();
    return group;
  }

  private async update(group: Group): Promise<Group> {
    this.convertFromModel(group);
    await getDb().updateTable("groups").set({
      categoryName: group.categoryName,
      name: group.name,
      trackAttendance: group.trackAttendance,
      parentPickup: group.parentPickup,
      printNametag: group.printNametag,
      about: group.about,
      photoUrl: group.photoUrl,
      tags: group.tags,
      meetingTime: group.meetingTime,
      meetingLocation: group.meetingLocation,
      labels: group.labels as any,
      slug: group.slug
    }).where("id", "=", group.id).where("churchId", "=", group.churchId).execute();
    return group;
  }

  public async delete(churchId: string, id: string) {
    await getDb().updateTable("groups").set({ removed: true as any }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteByIds(churchId: string, ids: string[]) {
    if (!ids.length) return;
    await getDb().updateTable("groups").set({ removed: true as any }).where("id", "in", ids).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("groups").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false as any).executeTakeFirst()) ?? null;
  }

  public async loadPublicSlug(churchId: string, slug: string) {
    return (await getDb().selectFrom("groups").selectAll().where("churchId", "=", churchId).where("slug", "=", slug).where("removed", "=", false as any).executeTakeFirst()) ?? null;
  }

  public async loadByTag(churchId: string, tag: string) {
    const result = await sql`SELECT *, (SELECT COUNT(*) FROM groupMembers gm WHERE gm.groupId=g.id) AS memberCount FROM \`groups\` g WHERE churchId=${churchId} AND removed=0 AND tags LIKE ${"%" + tag + "%"} ORDER BY categoryName, name`.execute(getDb());
    return result.rows;
  }

  public async loadAll(churchId: string) {
    const result = await sql`SELECT *, (SELECT COUNT(*) FROM groupMembers gm WHERE gm.groupId=g.id) AS memberCount FROM \`groups\` g WHERE churchId=${churchId} AND removed=0 ORDER BY categoryName, name`.execute(getDb());
    return result.rows;
  }

  public async loadAllForPerson(personId: string) {
    const result = await sql`SELECT DISTINCT g.* FROM groupMembers gm INNER JOIN \`groups\` g ON g.id=gm.groupId WHERE personId=${personId} AND g.removed=0 ORDER BY name`.execute(getDb());
    return result.rows;
  }

  public async loadForPerson(personId: string) {
    const result = await sql`SELECT DISTINCT g.* FROM groupMembers gm INNER JOIN \`groups\` g ON g.id=gm.groupId WHERE personId=${personId} AND g.removed=0 AND g.tags LIKE '%standard%' ORDER BY name`.execute(getDb());
    return result.rows;
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (!ids.length) return [];
    return getDb().selectFrom("groups").selectAll().where("churchId", "=", churchId).where("id", "in", ids).orderBy("name").execute();
  }

  public async publicLabel(churchId: string, label: string) {
    return getDb().selectFrom("groups").selectAll()
      .where("churchId", "=", churchId)
      .where("labels", "like", "%" + label + "%")
      .where("removed", "=", false as any)
      .orderBy("name")
      .execute();
  }

  public async search(churchId: string, campusId: string, serviceId: string, serviceTimeId: string) {
    const result = await sql`SELECT g.id, g.categoryName, g.name FROM \`groups\` g LEFT OUTER JOIN groupServiceTimes gst ON gst.groupId=g.id LEFT OUTER JOIN serviceTimes st ON st.id=gst.serviceTimeId LEFT OUTER JOIN services s ON s.id=st.serviceId WHERE g.churchId = ${churchId} AND (${serviceTimeId}=0 OR gst.serviceTimeId=${serviceTimeId}) AND (${serviceId}=0 OR st.serviceId=${serviceId}) AND (${campusId} = 0 OR s.campusId = ${campusId}) AND g.removed=0 GROUP BY g.id, g.categoryName, g.name ORDER BY g.name`.execute(getDb());
    return result.rows;
  }

  public convertFromModel(group: Group) {
    group.labels = null;
    if (group.labelArray?.length > 0) group.labels = group.labelArray.join(",");
  }

  public saveAll(models: Group[]) {
    const promises: Promise<Group>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Group): Promise<Group> {
    return this.create(model);
  }

  protected rowToModel(row: any): Group {
    const result: Group = {
      id: row.id,
      churchId: row.churchId,
      categoryName: row.categoryName,
      name: row.name,
      trackAttendance: row.trackAttendance,
      parentPickup: row.parentPickup,
      printNametag: row.printNametag,
      memberCount: row.memberCount,
      about: row.about,
      photoUrl: row.photoUrl,
      tags: row.tags,
      meetingTime: row.meetingTime,
      meetingLocation: row.meetingLocation,
      labelArray: [],
      slug: row.slug
    };
    row.labels?.split(",").forEach((label: string) => result.labelArray.push(label.trim()));
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
