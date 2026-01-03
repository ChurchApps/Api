import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { Form } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class FormRepo extends ConfiguredRepo<Form> {
  protected get repoConfig(): RepoConfig<Form> {
    return {
      tableName: "forms",
      hasSoftDelete: true,
      removedColumn: "removed",
      insertColumns: ["name", "contentType", "accessStartTime", "accessEndTime", "restricted", "thankYouMessage"],
      updateColumns: ["name", "contentType", "restricted", "accessStartTime", "accessEndTime", "archived", "thankYouMessage"],
      insertLiterals: { createdTime: "NOW()", modifiedTime: "NOW()", archived: "0", removed: "0" },
      updateLiterals: { modifiedTime: "NOW()" }
    };
  }
  protected async create(form: Form): Promise<Form> {
    (form as any).accessStartTime = form.accessStartTime ? DateHelper.toMysqlDate(form.accessStartTime) : null;
    (form as any).accessEndTime = form.accessEndTime ? DateHelper.toMysqlDate(form.accessEndTime) : null;
    return super.create(form);
  }

  protected async update(form: Form): Promise<Form> {
    (form as any).accessStartTime = form.accessStartTime ? DateHelper.toMysqlDate(form.accessStartTime) : null;
    (form as any).accessEndTime = form.accessEndTime ? DateHelper.toMysqlDate(form.accessEndTime) : null;
    return super.update(form);
  }

  public loadAllArchived(churchId: string) {
    return TypedDB.query("SELECT * FROM forms WHERE churchId=? AND removed=0 AND archived=1;", [churchId]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    const quotedAndCommaSeparated = ids.length === 0 ? "" : "'" + ids.join("','") + "'";
    const sql = "SELECT * FROM forms WHERE churchId=? AND removed=0 AND archived=0 AND id IN (" + quotedAndCommaSeparated + ") ORDER by name";
    return TypedDB.query(sql, [churchId]);
  }

  public loadNonMemberForms(churchId: string) {
    return TypedDB.query("SELECT * FROM forms WHERE contentType<>'form' AND churchId=? AND removed=0 AND archived=0", [churchId]);
  }

  public loadNonMemberArchivedForms(churchId: string) {
    return TypedDB.query("SELECT * FROM forms WHERE contentType<>'form' AND churchId=? AND removed=0 AND archived=1", [churchId]);
  }

  public loadMemberForms(churchId: string, personId: string) {
    return TypedDB.query(
      "SELECT f.* , mp.action FROM forms f  " + "LEFT JOIN memberPermissions mp " + "ON mp.contentId = f.id " + "WHERE mp.memberId=? AND f.churchId=? AND f.removed=0 AND f.archived=0",
      [personId, churchId]
    );
  }

  public loadMemberArchivedForms(churchId: string, personId: string) {
    return TypedDB.query("SELECT f.* FROM forms f  " + "LEFT JOIN memberPermissions mp " + "ON mp.contentId = f.id " + "WHERE mp.memberId=? AND f.churchId=? AND f.removed=0 AND f.archived=1", [
      personId,
      churchId
    ]);
  }

  public loadWithMemberPermissions(churchId: string, formId: string, personId: string) {
    return TypedDB.queryOne(
      "SELECT f.*, mp.action FROM forms f " + "LEFT JOIN memberPermissions mp " + "ON mp.contentId = f.id " + "WHERE f.id=? AND f.churchId=? AND mp.memberId=? AND f.removed=0 AND archived=0",
      [formId, churchId, personId]
    );
  }

  public access(id: string) {
    return TypedDB.queryOne("SELECT id, name, restricted, churchId FROM forms WHERE id=? AND removed=0 AND archived=0;", [id]);
  }

  protected rowToModel(row: any): Form {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      contentType: row.contentType,
      createdTime: row.createdTime,
      modifiedTime: row.modifiedTime,
      accessStartTime: row.accessStartTime,
      accessEndTime: row.accessEndTime,
      restricted: row.restricted,
      archived: row.archived,
      action: row.action,
      thankYouMessage: row.thankYouMessage
    };
  }
}
