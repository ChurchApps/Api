import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { RolePermission, Api, LoginUserChurch } from "../models/index.js";
import { ArrayHelper } from "@churchapps/apihelper";

@injectable()
export class RolePermissionRepo {
  public async save(model: RolePermission) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: RolePermission): Promise<RolePermission> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("rolePermissions").values({
      id: model.id,
      churchId: model.churchId,
      roleId: model.roleId,
      apiName: model.apiName,
      contentType: model.contentType,
      contentId: model.contentId,
      action: model.action
    }).execute();
    return model;
  }

  private async update(model: RolePermission): Promise<RolePermission> {
    await getDb().updateTable("rolePermissions").set({
      roleId: model.roleId,
      apiName: model.apiName,
      contentType: model.contentType,
      contentId: model.contentId,
      action: model.action
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async deleteForRole(churchId: string, roleId: string) {
    await getDb().deleteFrom("rolePermissions").where("churchId", "=", churchId).where("roleId", "=", roleId).execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("rolePermissions").where("churchId", "=", churchId).where("id", "=", id).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("rolePermissions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("rolePermissions").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForUser(userId: string, removeUniversal: boolean): Promise<LoginUserChurch[]> {
    const rawResult = await sql`SELECT c.name AS churchName, r.churchId, c.subDomain, rp.apiName, rp.contentType, rp.contentId, rp.action, p.id AS personId, p.membershipStatus, c.archivedDate, c.address1, c.address2, c.city, c.state, c.zip, c.country FROM roleMembers rm INNER JOIN roles r ON r.id=rm.roleId INNER JOIN rolePermissions rp ON (rp.roleId=r.id OR (rp.roleId IS NULL AND rp.churchId=rm.churchId)) LEFT JOIN churches c ON c.id=r.churchId LEFT JOIN userChurches uc ON uc.churchId=r.churchId AND uc.userId = rm.userId LEFT JOIN people p ON p.id = uc.personId AND p.churchId=uc.churchId AND (p.removed=0 OR p.removed IS NULL) WHERE rm.userId=${userId} GROUP BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action, p.id, p.membershipStatus, c.archivedDate ORDER BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action, p.id, p.membershipStatus, c.archivedDate`.execute(getDb());
    const data = rawResult.rows as any[];

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
    const rawResult = await sql`SELECT c.name AS churchName, r.churchId, c.subDomain, rp.apiName, rp.contentType, rp.contentId, rp.action, c.archivedDate, c.address1, c.address2, c.city, c.state, c.zip, c.country FROM roles r INNER JOIN rolePermissions rp ON rp.roleId=r.id LEFT JOIN churches c ON c.id=r.churchId WHERE c.id=${churchId} GROUP BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action ORDER BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action`.execute(getDb());
    const data = rawResult.rows as any[];
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
        // Apply universal permissions
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
    const rawResult = await sql`SELECT c.name AS churchName, r.churchId, c.subDomain, rp.apiName, rp.contentType, rp.contentId, rp.action, c.archivedDate, c.address1, c.address2, c.city, c.state, c.zip, c.country FROM roleMembers rm INNER JOIN roles r ON r.id=rm.roleId INNER JOIN rolePermissions rp ON (rp.roleId=r.id OR (rp.roleId IS NULL AND rp.churchId=rm.churchId)) LEFT JOIN churches c ON c.id=r.churchId WHERE rm.userId=${userId} AND rm.churchId=${churchId} GROUP BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action ORDER BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action`.execute(getDb());
    const data = rawResult.rows as any[];

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

  public async loadByRoleId(churchId: string, roleId: string): Promise<RolePermission[]> {
    return getDb().selectFrom("rolePermissions").selectAll().where("churchId", "=", churchId).where("roleId", "=", roleId).execute() as Promise<RolePermission[]>;
  }

  // permissions applied to all the members of church
  public async loadForEveryone(churchId: string) {
    return getDb().selectFrom("rolePermissions as rp")
      .leftJoin("churches as c", "c.id", "rp.churchId")
      .select(["rp.id", "rp.churchId", "rp.roleId", "rp.apiName", "rp.contentType", "rp.contentId", "rp.action", "c.name as churchName", "c.subDomain"])
      .where("rp.churchId", "=", churchId)
      .where("rp.roleId", "is", null)
      .execute();
  }

  public saveAll(models: RolePermission[]) {
    const promises: Promise<RolePermission>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: RolePermission): Promise<RolePermission> {
    return this.create(model);
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
