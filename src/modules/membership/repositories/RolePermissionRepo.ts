import { injectable } from "inversify";
import { eq, and, sql, isNull } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { rolePermissions, churches } from "../../../db/schema/membership.js";
import { RolePermission, Api, LoginUserChurch } from "../models/index.js";
import { ArrayHelper } from "@churchapps/apihelper";

@injectable()
export class RolePermissionRepo extends DrizzleRepo<typeof rolePermissions> {
  protected readonly table = rolePermissions;
  protected readonly moduleName = "membership";

  public deleteForRole(churchId: string, roleId: string) {
    return this.db.delete(rolePermissions).where(and(eq(rolePermissions.churchId, churchId), eq(rolePermissions.roleId, roleId)));
  }

  public async loadForUser(userId: string, removeUniversal: boolean): Promise<LoginUserChurch[]> {
    const data = await this.executeRows(sql`
      SELECT c.name AS churchName, r.churchId, c.subDomain, rp.apiName, rp.contentType, rp.contentId, rp.action,
        p.id AS personId, p.membershipStatus, c.archivedDate, c.address1, c.address2, c.city, c.state, c.zip, c.country
      FROM roleMembers rm
      INNER JOIN roles r on r.id=rm.roleId
      INNER JOIN rolePermissions rp on (rp.roleId=r.id or (rp.roleId IS NULL AND rp.churchId=rm.churchId))
      LEFT JOIN churches c on c.id=r.churchId
      LEFT JOIN userChurches uc on uc.churchId=r.churchId AND uc.userId = rm.userId
      LEFT JOIN people p on p.id = uc.personId AND p.churchId=uc.churchId AND (p.removed=0 OR p.removed IS NULL)
      WHERE rm.userId=${userId}
      GROUP BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action, p.id, p.membershipStatus, c.archivedDate
      ORDER BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action, p.id, p.membershipStatus, c.archivedDate
    `);

    const result: LoginUserChurch[] = [];
    let currentUserChurch: LoginUserChurch = null;
    let currentApi: Api = null;
    let reportingApi: Api = null;
    data.forEach((row: any) => {
      if (currentUserChurch === null || row.churchId !== currentUserChurch.church.id) {
        currentUserChurch = {
          church: {
            id: row.churchId,
            name: row.churchName,
            subDomain: row.subDomain,
            archivedDate: row.archivedDate,
            address1: row.address1,
            address2: row.address2,
            city: row.city,
            state: row.state,
            zip: row.zip,
            country: row.country
          },
          person: {
            id: row.personId,
            membershipStatus: row.membershipStatus
          },
          apis: []
        };
        result.push(currentUserChurch);
        currentApi = null;
        reportingApi = { keyName: "ReportingApi", permissions: [] };
        currentUserChurch.apis.push(reportingApi);
      }
      if (currentApi === null || row.apiName !== currentApi.keyName) {
        currentApi = { keyName: row.apiName, permissions: [] };
        currentUserChurch.apis.push(currentApi);
      }

      const permission: RolePermission = { action: row.action, contentId: row.contentId, contentType: row.contentType };
      currentApi.permissions.push(permission);
    });

    if (result.length > 0 && this.applyUniversal(result) && removeUniversal) result.splice(0, 1);

    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].church.archivedDate) result.splice(i, 1);
    }

    return result;
  }

  public async loadForChurch(churchId: string, univeralChurch: LoginUserChurch): Promise<LoginUserChurch> {
    const data = await this.executeRows(sql`
      SELECT c.name AS churchName, r.churchId, c.subDomain, rp.apiName, rp.contentType, rp.contentId, rp.action,
        c.archivedDate, c.address1, c.address2, c.city, c.state, c.zip, c.country
      FROM roles r
      INNER JOIN rolePermissions rp on rp.roleId=r.id
      LEFT JOIN churches c on c.id=r.churchId
      WHERE c.id=${churchId}
      GROUP BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action
      ORDER BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action
    `);

    let result: LoginUserChurch = null;
    let currentApi: Api = null;
    data.forEach((row: any) => {
      if (result === null) {
        result = {
          church: {
            id: row.churchId,
            subDomain: row.subDomain,
            name: row.churchName,
            archivedDate: row.archivedDate,
            address1: row.address1,
            address2: row.address2,
            city: row.city,
            state: row.state,
            zip: row.zip,
            country: row.country
          },
          person: {
            id: row.personId || "",
            membershipStatus: ""
          },
          apis: []
        };
        currentApi = null;
      }

      if (currentApi === null || row.apiName !== currentApi.keyName) {
        currentApi = { keyName: row.apiName, permissions: [] };
        result.apis.push(currentApi);
        if (univeralChurch !== null) {
          univeralChurch.apis.forEach((universalApi) => {
            if (universalApi.keyName === currentApi.keyName) {
              universalApi.permissions.forEach((perm) => {
                currentApi.permissions.push(perm);
              });
            }
          });
        }
      }

      const permission: RolePermission = { action: row.action, contentId: row.contentId, contentType: row.contentType };
      currentApi.permissions.push(permission);
    });

    return result;
  }

  public async loadUserPermissionInChurch(userId: string, churchId: string) {
    const data = await this.executeRows(sql`
      SELECT c.name AS churchName, r.churchId, c.subDomain, rp.apiName, rp.contentType, rp.contentId, rp.action,
        c.archivedDate, c.address1, c.address2, c.city, c.state, c.zip, c.country
      FROM roleMembers rm
      INNER JOIN roles r on r.id=rm.roleId
      INNER JOIN rolePermissions rp on (rp.roleId=r.id or (rp.roleId IS NULL AND rp.churchId=rm.churchId))
      LEFT JOIN churches c on c.id=r.churchId
      WHERE rm.userId=${userId} AND rm.churchId=${churchId}
      GROUP BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action
      ORDER BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action
    `);

    let result: LoginUserChurch = null;
    let currentApi: Api = null;

    data.forEach((row: any) => {
      if (result === null) {
        result = {
          church: {
            id: row.churchId,
            subDomain: row.subDomain,
            name: row.churchName,
            archivedDate: row.archivedDate,
            address1: row.address1,
            address2: row.address2,
            city: row.city,
            state: row.state,
            zip: row.zip,
            country: row.country
          },
          person: {
            id: row.personId || "",
            membershipStatus: ""
          },
          apis: []
        };
        currentApi = null;
      }

      if (currentApi === null || row.apiName !== currentApi.keyName) {
        currentApi = { keyName: row.apiName, permissions: [] };
        result.apis.push(currentApi);
      }

      const permission: RolePermission = { action: row.action, contentId: row.contentId, contentType: row.contentType };
      currentApi.permissions.push(permission);
    });

    return result;
  }

  // Apply site admin priviledges that aren't tied to a specific church.
  private applyUniversal(userChurches: LoginUserChurch[]) {
    if (userChurches[0].church.id !== "0") return false;
    for (let i = 1; i < userChurches.length; i++) {
      const currentUserChurch = userChurches[i];

      userChurches[0].apis.forEach((universalApi) => {
        const api = ArrayHelper.getOne(currentUserChurch.apis, "keyName", universalApi.keyName);
        if (api === null) currentUserChurch.apis.push({ ...universalApi });
        else {
          universalApi.permissions.forEach((perm) => {
            api.permissions.push(perm);
          });
        }
      });
    }
    return true;
  }

  public loadByRoleId(churchId: string, roleId: string): Promise<RolePermission[]> {
    return this.db.select().from(rolePermissions)
      .where(and(eq(rolePermissions.churchId, churchId), eq(rolePermissions.roleId, roleId))) as Promise<RolePermission[]>;
  }

  // permissions applied to all the members of church
  public loadForEveryone(churchId: string) {
    return this.db.select({
      id: rolePermissions.id,
      churchId: rolePermissions.churchId,
      roleId: rolePermissions.roleId,
      apiName: rolePermissions.apiName,
      contentType: rolePermissions.contentType,
      contentId: rolePermissions.contentId,
      action: rolePermissions.action,
      churchName: churches.name,
      subDomain: churches.subDomain
    })
      .from(rolePermissions)
      .leftJoin(churches, eq(churches.id, rolePermissions.churchId))
      .where(and(eq(rolePermissions.churchId, churchId), isNull(rolePermissions.roleId)));
  }
}
