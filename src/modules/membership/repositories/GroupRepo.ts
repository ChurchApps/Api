import { injectable } from "inversify";
import { eq, and, sql, inArray, like, asc, count } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { groups, groupMembers } from "../../../db/schema/membership.js";
import { Group } from "../models/index.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class GroupRepo extends DrizzleRepo<typeof groups> {
  protected readonly table = groups;
  protected readonly moduleName = "membership";
  protected readonly softDelete = true;

  public async save(group: Group) {
    this.convertFromModel(group);
    if (group.id) {
      return this.update(group);
    } else {
      return this.create(group);
    }
  }

  private async create(group: Group): Promise<Group> {
    group.id = UniqueIdHelper.shortId();
    this.convertFromModel(group);
    const data: any = { ...group, removed: false };
    delete data.labelArray;
    delete data.memberCount;
    await this.db.insert(groups).values(data);
    return group;
  }

  private async update(group: Group): Promise<Group> {
    this.convertFromModel(group);
    const data: any = { ...group };
    delete data.id;
    delete data.churchId;
    delete data.labelArray;
    delete data.memberCount;
    await this.db.update(groups).set(data)
      .where(and(eq(groups.id, group.id!), eq(groups.churchId, group.churchId!)));
    return group;
  }

  public deleteByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve();
    return this.db.update(groups).set({ removed: true } as any)
      .where(and(inArray(groups.id, ids), eq(groups.churchId, churchId)));
  }

  public load(churchId: string, id: string) {
    return this.db.select().from(groups)
      .where(and(eq(groups.id, id), eq(groups.churchId, churchId), eq(groups.removed, false)))
      .then(r => r[0] ? this.rowToModel(r[0]) : null);
  }

  public loadPublicSlug(churchId: string, slug: string) {
    return this.db.select().from(groups)
      .where(and(eq(groups.churchId, churchId), eq(groups.slug, slug), eq(groups.removed, false)))
      .then(r => r[0] ? this.rowToModel(r[0]) : null);
  }

  public async loadByTag(churchId: string, tag: string) {
    const memberCountSq = this.db.select({
      groupId: groupMembers.groupId,
      memberCount: count().as("memberCount")
    }).from(groupMembers).groupBy(groupMembers.groupId).as("mc");

    const rows = await this.db.select({
      id: groups.id,
      churchId: groups.churchId,
      categoryName: groups.categoryName,
      name: groups.name,
      trackAttendance: groups.trackAttendance,
      parentPickup: groups.parentPickup,
      printNametag: groups.printNametag,
      about: groups.about,
      photoUrl: groups.photoUrl,
      tags: groups.tags,
      meetingTime: groups.meetingTime,
      meetingLocation: groups.meetingLocation,
      labels: groups.labels,
      slug: groups.slug,
      removed: groups.removed,
      memberCount: sql`COALESCE(${memberCountSq.memberCount}, 0)`.as("memberCount")
    })
      .from(groups)
      .leftJoin(memberCountSq, eq(memberCountSq.groupId, groups.id))
      .where(and(eq(groups.churchId, churchId), eq(groups.removed, false), like(groups.tags, `%${tag}%`)))
      .orderBy(asc(groups.categoryName), asc(groups.name));
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async loadAll(churchId: string) {
    const memberCountSq = this.db.select({
      groupId: groupMembers.groupId,
      memberCount: count().as("memberCount")
    }).from(groupMembers).groupBy(groupMembers.groupId).as("mc");

    const rows = await this.db.select({
      id: groups.id,
      churchId: groups.churchId,
      categoryName: groups.categoryName,
      name: groups.name,
      trackAttendance: groups.trackAttendance,
      parentPickup: groups.parentPickup,
      printNametag: groups.printNametag,
      about: groups.about,
      photoUrl: groups.photoUrl,
      tags: groups.tags,
      meetingTime: groups.meetingTime,
      meetingLocation: groups.meetingLocation,
      labels: groups.labels,
      slug: groups.slug,
      removed: groups.removed,
      memberCount: sql`COALESCE(${memberCountSq.memberCount}, 0)`.as("memberCount")
    })
      .from(groups)
      .leftJoin(memberCountSq, eq(memberCountSq.groupId, groups.id))
      .where(and(eq(groups.churchId, churchId), eq(groups.removed, false)))
      .orderBy(asc(groups.categoryName), asc(groups.name));
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async loadAllForPerson(personId: string) {
    const rows = await this.db.selectDistinct({
      id: groups.id,
      churchId: groups.churchId,
      categoryName: groups.categoryName,
      name: groups.name,
      trackAttendance: groups.trackAttendance,
      parentPickup: groups.parentPickup,
      printNametag: groups.printNametag,
      about: groups.about,
      photoUrl: groups.photoUrl,
      tags: groups.tags,
      meetingTime: groups.meetingTime,
      meetingLocation: groups.meetingLocation,
      labels: groups.labels,
      slug: groups.slug,
      removed: groups.removed
    })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.personId, personId), eq(groups.removed, false)))
      .orderBy(asc(groups.name));
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async loadForPerson(personId: string) {
    const rows = await this.db.selectDistinct({
      id: groups.id,
      churchId: groups.churchId,
      categoryName: groups.categoryName,
      name: groups.name,
      trackAttendance: groups.trackAttendance,
      parentPickup: groups.parentPickup,
      printNametag: groups.printNametag,
      about: groups.about,
      photoUrl: groups.photoUrl,
      tags: groups.tags,
      meetingTime: groups.meetingTime,
      meetingLocation: groups.meetingLocation,
      labels: groups.labels,
      slug: groups.slug,
      removed: groups.removed
    })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.personId, personId), eq(groups.removed, false), like(groups.tags, "%standard%")))
      .orderBy(asc(groups.name));
    return rows.map((r: any) => this.rowToModel(r));
  }

  public loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(groups)
      .where(and(eq(groups.churchId, churchId), inArray(groups.id, ids), eq(groups.removed, false)))
      .then((rows: any) => rows.map((r: any) => this.rowToModel(r)));
  }

  public publicLabel(churchId: string, label: string) {
    return this.db.select().from(groups)
      .where(and(eq(groups.churchId, churchId), like(groups.labels, `%${label}%`), eq(groups.removed, false)))
      .then((rows: any) => rows.map((r: any) => this.rowToModel(r)));
  }

  public search(churchId: string, campusId: string, serviceId: string, serviceTimeId: string) {
    if (getDialect() === "postgres") {
      return this.executeRows(sql`
        SELECT g.id, g."categoryName", g.name
        FROM "groups" g
        LEFT OUTER JOIN "groupServiceTimes" gst ON gst."groupId" = g.id
        LEFT OUTER JOIN "serviceTimes" st ON st.id = gst."serviceTimeId"
        LEFT OUTER JOIN services s ON s.id = st."serviceId"
        WHERE g."churchId" = ${churchId}
          AND (${serviceTimeId} = '0' OR gst."serviceTimeId" = ${serviceTimeId})
          AND (${serviceId} = '0' OR st."serviceId" = ${serviceId})
          AND (${campusId} = '0' OR s."campusId" = ${campusId})
          AND g.removed = false
        GROUP BY g.id, g."categoryName", g.name ORDER BY g.name
      `);
    }
    return this.executeRows(sql`
      SELECT g.id, g.categoryName, g.name
      FROM \`groups\` g
      LEFT OUTER JOIN groupServiceTimes gst ON gst.groupId = g.id
      LEFT OUTER JOIN serviceTimes st ON st.id = gst.serviceTimeId
      LEFT OUTER JOIN services s ON s.id = st.serviceId
      WHERE g.churchId = ${churchId}
        AND (${serviceTimeId} = '0' OR gst.serviceTimeId = ${serviceTimeId})
        AND (${serviceId} = '0' OR st.serviceId = ${serviceId})
        AND (${campusId} = '0' OR s.campusId = ${campusId})
        AND g.removed = 0
      GROUP BY g.id, g.categoryName, g.name ORDER BY g.name
    `);
  }


  public convertFromModel(group: Group) {
    group.labels = null as any;
    if (group.labelArray?.length > 0) group.labels = group.labelArray.join(",") as any;
  }

  private rowToModel(row: any): Group {
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
}
