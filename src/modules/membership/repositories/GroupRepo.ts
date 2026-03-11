import { injectable } from "inversify";
import { eq, and, sql, inArray, like } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { groups } from "../../../db/schema/membership.js";
import { Group } from "../models/index.js";

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
    const rows = await this.executeRows(sql`
      SELECT *, (SELECT COUNT(*) FROM groupMembers gm WHERE gm.groupId = g.id) AS memberCount
      FROM \`groups\` g WHERE churchId = ${churchId} AND removed = 0 AND tags LIKE ${`%${tag}%`}
      ORDER BY categoryName, name
    `);
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async loadAll(churchId: string) {
    const rows = await this.executeRows(sql`
      SELECT *, (SELECT COUNT(*) FROM groupMembers gm WHERE gm.groupId = g.id) AS memberCount
      FROM \`groups\` g WHERE churchId = ${churchId} AND removed = 0
      ORDER BY categoryName, name
    `);
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async loadAllForPerson(personId: string) {
    const rows = await this.executeRows(sql`
      SELECT DISTINCT g.*
      FROM groupMembers gm
      INNER JOIN \`groups\` g ON g.id = gm.groupId
      WHERE personId = ${personId} AND g.removed = 0
      ORDER BY name
    `);
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async loadForPerson(personId: string) {
    const rows = await this.executeRows(sql`
      SELECT DISTINCT g.*
      FROM groupMembers gm
      INNER JOIN \`groups\` g ON g.id = gm.groupId
      WHERE personId = ${personId} AND g.removed = 0 AND g.tags LIKE '%standard%'
      ORDER BY name
    `);
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
