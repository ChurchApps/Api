import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { groupMembers } from "../../../db/schema/membership.js";
import { GroupMember } from "../models/index.js";
import { PersonHelper } from "../helpers/index.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class GroupMemberRepo extends DrizzleRepo<typeof groupMembers> {
  protected readonly table = groupMembers;
  protected readonly moduleName = "membership";

  public async save(model: GroupMember) {
    if (model.id) {
      const { id: _id, churchId: _churchId, ...setData } = model as any;
      delete setData.person;
      delete setData.group;
      await this.db.update(groupMembers).set(setData)
        .where(and(eq(groupMembers.id, model.id), eq(groupMembers.churchId, model.churchId!)));
    } else {
      model.id = UniqueIdHelper.shortId();
      const data: any = { ...model, joinDate: new Date() };
      delete data.person;
      delete data.group;
      await this.db.insert(groupMembers).values(data);
    }
    return model;
  }

  public async loadForGroup(churchId: string, groupId: string) {
    const rows = await this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT gm.*,
            p."photoUpdated", p."displayName", p.email, p."homePhone", p."mobilePhone", p."workPhone", p."optedOut",
            p.address1, p.address2, p.city, p.state, p.zip,
            p."householdId", p."householdRole"
          FROM "groupMembers" gm
          INNER JOIN people p ON p.id = gm."personId" AND (p.removed = false OR p.removed IS NULL)
          WHERE gm."churchId" = ${churchId} AND gm."groupId" = ${groupId}
          ORDER BY gm.leader DESC, p."lastName", p."firstName"`
        : sql`
          SELECT gm.*,
            p.photoUpdated, p.displayName, p.email, p.homePhone, p.mobilePhone, p.workPhone, p.optedOut,
            p.address1, p.address2, p.city, p.state, p.zip,
            p.householdId, p.householdRole
          FROM groupMembers gm
          INNER JOIN people p ON p.id = gm.personId AND (p.removed = 0 OR p.removed IS NULL)
          WHERE gm.churchId = ${churchId} AND gm.groupId = ${groupId}
          ORDER BY gm.leader DESC, p.lastName, p.firstName`
    );
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async loadLeadersForGroup(churchId: string, groupId: string) {
    const rows = await this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT gm.*, p."photoUpdated", p."displayName"
          FROM "groupMembers" gm
          INNER JOIN people p ON p.id = gm."personId" AND (p.removed = false OR p.removed IS NULL)
          WHERE gm."churchId" = ${churchId} AND gm."groupId" = ${groupId} AND gm.leader = true
          ORDER BY p."lastName", p."firstName"`
        : sql`
          SELECT gm.*, p.photoUpdated, p.displayName
          FROM groupMembers gm
          INNER JOIN people p ON p.id = gm.personId AND (p.removed = 0 OR p.removed IS NULL)
          WHERE gm.churchId = ${churchId} AND gm.groupId = ${groupId} AND gm.leader = 1
          ORDER BY p.lastName, p.firstName`
    );
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async loadForGroups(churchId: string, groupIds: string[]) {
    if (groupIds.length === 0) return [];
    const idList = sql.join(groupIds.map(id => sql`${id}`), sql`, `);
    const rows = await this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT gm.*, p."photoUpdated", p."displayName", p.email
          FROM "groupMembers" gm
          INNER JOIN people p ON p.id = gm."personId" AND (p.removed = false OR p.removed IS NULL)
          WHERE gm."churchId" = ${churchId} AND gm."groupId" IN (${idList})
          ORDER BY gm.leader DESC, p."lastName", p."firstName"`
        : sql`
          SELECT gm.*, p.photoUpdated, p.displayName, p.email
          FROM groupMembers gm
          INNER JOIN people p ON p.id = gm.personId AND (p.removed = 0 OR p.removed IS NULL)
          WHERE gm.churchId = ${churchId} AND gm.groupId IN (${idList})
          ORDER BY gm.leader DESC, p.lastName, p.firstName`
    );
    return rows.map((r: any) => this.rowToModel(r));
  }

  public async loadForPerson(churchId: string, personId: string) {
    const rows = await this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT gm.*, g.name AS "groupName"
          FROM "groupMembers" gm
          INNER JOIN "groups" g ON g.id = gm."groupId"
          WHERE gm."churchId" = ${churchId} AND gm."personId" = ${personId} AND g.removed = false
          ORDER BY g.name`
        : sql`
          SELECT gm.*, g.name AS groupName
          FROM groupMembers gm
          INNER JOIN \`groups\` g ON g.id = gm.groupId
          WHERE gm.churchId = ${churchId} AND gm.personId = ${personId} AND g.removed = 0
          ORDER BY g.name`
    );
    return rows.map((r: any) => this.rowToModel(r));
  }

  public loadForPeople(peopleIds: string[]) {
    if (peopleIds.length === 0) return Promise.resolve([]);
    const idList = sql.join(peopleIds.map(id => sql`${id}`), sql`, `);
    return this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT gm.*, g.name, g.tags
          FROM "groupMembers" gm
          INNER JOIN "groups" g ON g.id = gm."groupId"
          WHERE gm."personId" IN (${idList})`
        : sql`
          SELECT gm.*, g.name, g.tags
          FROM groupMembers gm
          INNER JOIN \`groups\` g ON g.id = gm.groupId
          WHERE gm.personId IN (${idList})`
    );
  }

  private rowToModel(row: any): GroupMember {
    const result: GroupMember = {
      id: row.id,
      churchId: row.churchId,
      groupId: row.groupId,
      personId: row.personId,
      joinDate: row.joinDate,
      leader: row.leader
    };
    if (row.displayName !== undefined) {
      result.person = {
        id: result.personId,
        photoUpdated: row.photoUpdated,
        name: { display: row.displayName },
        contactInfo: {
          email: row.email,
          homePhone: row.homePhone,
          mobilePhone: row.mobilePhone,
          workPhone: row.workPhone,
          address1: row.address1,
          address2: row.address2,
          city: row.city,
          state: row.state,
          zip: row.zip
        },
        householdId: row.householdId,
        householdRole: row.householdRole,
        optedOut: row.optedOut
      };
      result.person.photo = PersonHelper.getPhotoPath(row.churchId, result.person);
    }
    if (row.groupName !== undefined) result.group = { id: result.groupId, name: row.groupName };
    return result;
  }


  public convertAllToBasicModel(churchId: string, data: any[]) {
    const result: GroupMember[] = [];
    data.forEach((d) => result.push(this.convertToBasicModel(churchId, d)));
    return result;
  }

  public convertToBasicModel(_churchId: string, data: any) {
    const result = { id: data.id, groupId: data.groupId, personId: data.personId, displayName: data.displayName };
    return result;
  }
}
