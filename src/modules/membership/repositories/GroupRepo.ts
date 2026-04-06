import { injectable } from "inversify";
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
    return getDb().selectFrom("groups as g")
      .selectAll("g")
      .select((eb) => eb.selectFrom("groupMembers as gm").whereRef("gm.groupId", "=", "g.id").select(eb.fn.countAll().as("count")).as("memberCount"))
      .where("g.churchId", "=", churchId)
      .where("g.removed", "=", 0 as any)
      .where("g.tags", "like", "%" + tag + "%")
      .orderBy("g.categoryName")
      .orderBy("g.name")
      .execute();
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("groups as g")
      .selectAll("g")
      .select((eb) => eb.selectFrom("groupMembers as gm").whereRef("gm.groupId", "=", "g.id").select(eb.fn.countAll().as("count")).as("memberCount"))
      .where("g.churchId", "=", churchId)
      .where("g.removed", "=", 0 as any)
      .orderBy("g.categoryName")
      .orderBy("g.name")
      .execute();
  }

  public async loadAllForPerson(personId: string) {
    return getDb().selectFrom("groupMembers as gm")
      .innerJoin("groups as g", "g.id", "gm.groupId")
      .selectAll("g")
      .distinct()
      .where("gm.personId", "=", personId)
      .where("g.removed", "=", 0 as any)
      .orderBy("g.name")
      .execute();
  }

  public async loadForPerson(personId: string) {
    return getDb().selectFrom("groupMembers as gm")
      .innerJoin("groups as g", "g.id", "gm.groupId")
      .selectAll("g")
      .distinct()
      .where("gm.personId", "=", personId)
      .where("g.removed", "=", 0 as any)
      .where("g.tags", "like", "%standard%")
      .orderBy("g.name")
      .execute();
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
    let query = (getDb() as any).selectFrom("groups as g")
      .leftJoin("groupServiceTimes as gst", "gst.groupId", "g.id")
      .leftJoin("serviceTimes as st", "st.id", "gst.serviceTimeId")
      .leftJoin("services as s", "s.id", "st.serviceId")
      .select(["g.id", "g.categoryName", "g.name"])
      .where("g.churchId", "=", churchId)
      .where("g.removed", "=", 0 as any);
    if (serviceTimeId !== "0") query = query.where("gst.serviceTimeId", "=", serviceTimeId);
    if (serviceId !== "0") query = query.where("st.serviceId", "=", serviceId);
    if (campusId !== "0") query = query.where("s.campusId", "=", campusId);
    return query.groupBy(["g.id", "g.categoryName", "g.name"]).orderBy("g.name").execute();
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
