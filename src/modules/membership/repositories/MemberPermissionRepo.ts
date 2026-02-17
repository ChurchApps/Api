import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { MemberPermission } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class MemberPermissionRepo extends ConfiguredRepo<MemberPermission> {
  protected get repoConfig(): RepoConfig<MemberPermission> {
    return {
      tableName: "memberPermissions",
      hasSoftDelete: false,
      columns: ["memberId", "contentType", "contentId", "action", "emailNotification"]
    };
  }

  public deleteByMemberId(churchId: string, memberId: string, contentId: string) {
    return TypedDB.query("DELETE FROM memberPermissions WHERE memberId=? AND contentId=? AND churchId=?;", [memberId, churchId, contentId]);
  }

  public loadMyByForm(churchId: string, formId: string, personId: string) {
    return TypedDB.queryOne("SELECT * FROM memberPermissions WHERE churchId=? and contentType='form' and contentId=? and memberId=?;", [churchId, formId, personId]);
  }

  public loadByEmailNotification(churchId: string, contentType: string, contentId: string, emailNotification: boolean) {
    return TypedDB.query("SELECT * FROM memberPermissions WHERE churchId=? AND contentType=? AND contentId=? AND emailNotification=?;", [churchId, contentType, contentId, emailNotification]);
  }

  public loadFormsByPerson(churchId: string, personId: string) {
    const sql =
      "SELECT mp.*, p.displayName as personName" +
      " FROM memberPermissions mp" +
      " INNER JOIN `people` p on p.id=mp.memberId AND (p.removed=0 OR p.removed IS NULL)" +
      " WHERE mp.churchId=? AND mp.memberId=?" +
      " ORDER BY mp.action, mp.emailNotification desc;";
    return TypedDB.query(sql, [churchId, personId]);
  }

  public loadPeopleByForm(churchId: string, formId: string) {
    const sql =
      "SELECT mp.*, p.displayName as personName" +
      " FROM memberPermissions mp" +
      " INNER JOIN `people` p on p.id=mp.memberId AND (p.removed=0 OR p.removed IS NULL)" +
      " WHERE mp.churchId=? AND mp.contentId=?" +
      " ORDER BY mp.action, mp.emailNotification desc;";
    return TypedDB.query(sql, [churchId, formId]);
  }

  protected rowToModel(row: any): MemberPermission {
    return {
      id: row.id,
      churchId: row.churchId,
      memberId: row.memberId,
      contentType: row.contentType,
      contentId: row.contentId,
      action: row.action,
      personName: row.personName,
      emailNotification: row.emailNotification
    };
  }

  private existingPermissionRecord(churchId: string, contentId: string) {
    return TypedDB.queryOne("SELECT * FROM memberPermissions WHERE contentId=? AND churchId=?;", [contentId, churchId]);
  }
}
