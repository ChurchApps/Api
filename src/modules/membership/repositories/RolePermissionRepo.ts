import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { RolePermission, Api, LoginUserChurch } from "../models/index.js";
import { ArrayHelper } from "@churchapps/apihelper";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class RolePermissionRepo extends ConfiguredRepo<RolePermission> {
  protected get repoConfig(): RepoConfig<RolePermission> {
    return {
      tableName: "rolePermissions",
      hasSoftDelete: false,
      columns: ["roleId", "apiName", "contentType", "contentId", "action"]
    };
  }

  public deleteForRole(churchId: string, roleId: string) {
    const sql = "DELETE FROM rolePermissions WHERE churchId=? AND roleId=?";
    const params = [churchId, roleId];
    return TypedDB.query(sql, params);
  }

  public delete(churchId: string, id: string) {
    const sql = "DELETE FROM rolePermissions WHERE churchId=? AND id=?";
    const params = [churchId, id];
    return TypedDB.query(sql, params);
  }

  public async loadForUser(userId: string, removeUniversal: boolean): Promise<LoginUserChurch[]> {
    const query =
      "SELECT c.name AS churchName, r.churchId, c.subDomain, rp.apiName, rp.contentType, rp.contentId, rp.action, p.id AS personId, p.membershipStatus, c.archivedDate, c.address1, c.address2, c.city, c.state, c.zip, c.country" +
      " FROM roleMembers rm" +
      " INNER JOIN roles r on r.id=rm.roleId" +
      " INNER JOIN rolePermissions rp on (rp.roleId=r.id or (rp.roleId IS NULL AND rp.churchId=rm.churchId))" +
      " LEFT JOIN churches c on c.id=r.churchId" +
      " LEFT JOIN userChurches uc on uc.churchId=r.churchId AND uc.userId = rm.userId" +
      " LEFT JOIN people p on p.id = uc.personId AND p.churchId=uc.churchId AND (p.removed=0 OR p.removed IS NULL)" +
      " WHERE rm.userId=?" +
      " GROUP BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action, p.id, p.membershipStatus, c.archivedDate" +
      " ORDER BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action, p.id, p.membershipStatus, c.archivedDate";
    const data = (await TypedDB.query(query, [userId])) as any[];

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

      // const reportingPermission = { ...permission, apiName: row.apiName };
      // reportingApi.permissions.push(reportingPermission);
    });

    if (result.length > 0 && this.applyUniversal(result) && removeUniversal) result.splice(0, 1);

    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].church.archivedDate) result.splice(i, 1);
    }

    return result;
  }

  public async loadForChurch(churchId: string, univeralChurch: LoginUserChurch): Promise<LoginUserChurch> {
    const query =
      "SELECT c.name AS churchName, r.churchId, c.subDomain, rp.apiName, rp.contentType, rp.contentId, rp.action, c.archivedDate, c.address1, c.address2, c.city, c.state, c.zip, c.country" +
      " FROM roles r" +
      " INNER JOIN rolePermissions rp on rp.roleId=r.id" +
      " LEFT JOIN churches c on c.id=r.churchId" +
      " WHERE c.id=?" +
      " GROUP BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action" +
      " ORDER BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action";
    const data = (await TypedDB.query(query, [churchId])) as any[];
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
        if (univeralChurch !== null)
          univeralChurch.apis.forEach((universalApi) => {
            if (universalApi.keyName === currentApi.keyName)
              universalApi.permissions.forEach((perm) => {
                currentApi.permissions.push(perm);
              });
          });
      }

      const permission: RolePermission = { action: row.action, contentId: row.contentId, contentType: row.contentType };
      currentApi.permissions.push(permission);
    });
    /*
        univeralChurch.apis.forEach(universalApi => {
          const api = ArrayHelper.getOne(result.apis, "keyName", universalApi.keyName);
          if (api === null) result.apis.push(universalApi);
          else {
            universalApi.permissions.forEach(perm => { api.permissions.push(perm) });
          }
        });
    */
    return result;
  }

  public async loadUserPermissionInChurch(userId: string, churchId: string) {
    const query =
      "SELECT c.name AS churchName, r.churchId, c.subDomain, rp.apiName, rp.contentType, rp.contentId, rp.action, c.archivedDate, c.address1, c.address2, c.city, c.state, c.zip, c.country" +
      " FROM roleMembers rm" +
      " INNER JOIN roles r on r.id=rm.roleId" +
      " INNER JOIN rolePermissions rp on (rp.roleId=r.id or (rp.roleId IS NULL AND rp.churchId=rm.churchId))" +
      " LEFT JOIN churches c on c.id=r.churchId" +
      " WHERE rm.userId=? AND rm.churchId=?" +
      " GROUP BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action" +
      " ORDER BY c.name, r.churchId, rp.apiName, rp.contentType, rp.contentId, rp.action";
    const data = (await TypedDB.query(query, [userId, churchId])) as any[];

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
    return TypedDB.query("SELECT * FROM rolePermissions WHERE churchId=? AND roleId=?", [churchId, roleId]) as Promise<RolePermission[]>;
  }

  // permissions applied to all the members of church
  public loadForEveryone(churchId: string) {
    return TypedDB.query(
      "SELECT rp.id, rp.churchId, rp.roleId, rp.apiName, rp.contentType, rp.contentId, rp.action, c.name AS churchName, c.subDomain FROM rolePermissions rp LEFT JOIN churches c on c.id=rp.churchId WHERE rp.churchId=? AND rp.roleId IS NULL",
      [churchId]
    );
  }
}
