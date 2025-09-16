import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { FormSubmission } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { UniqueIdHelper, DateHelper } from "../helpers";

@injectable()
export class FormSubmissionRepository {
  public save(formSubmission: FormSubmission) {
    return formSubmission.id ? this.update(formSubmission) : this.create(formSubmission);
  }

  private async create(formSubmission: FormSubmission) {
    const submissionDate = DateHelper.toMysqlDate(formSubmission.submissionDate);
    const revisionDate = DateHelper.toMysqlDate(formSubmission.revisionDate);
    formSubmission.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO formSubmissions (id, churchId, formId, contentType, contentId, submissionDate, submittedBy, revisionDate, revisedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      formSubmission.id,
      formSubmission.churchId,
      formSubmission.formId,
      formSubmission.contentType,
      formSubmission.contentId,
      submissionDate,
      formSubmission.submittedBy,
      revisionDate,
      formSubmission.revisedBy
    ];
    await TypedDB.query(sql, params);
    return formSubmission;
  }

  private async update(formSubmission: FormSubmission) {
    const sql = "UPDATE formSubmissions SET revisionDate=NOW(), contentId=?, revisedBy=? WHERE id=? and churchId=?";
    const params = [formSubmission.contentId, formSubmission.revisedBy, formSubmission.id, formSubmission.churchId];
    await TypedDB.query(sql, params);
    return formSubmission;
  }

  public delete(churchId: string, id: string) {
    const sql = "DELETE FROM formSubmissions WHERE id=? AND churchId=?;";
    const params = [id, churchId];
    return TypedDB.query(sql, params);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM formSubmissions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM formSubmissions WHERE churchId=?;", [churchId]);
  }

  public loadForContent(churchId: string, contentType: string, contentId: string) {
    return TypedDB.query("SELECT * FROM formSubmissions WHERE churchId=? AND contentType=? AND contentId=?;", [churchId, contentType, contentId]);
  }

  public loadByFormId(churchId: string, formId: string) {
    return TypedDB.query("SELECT * FROM formSubmissions WHERE churchId=? AND formId=?;", [churchId, formId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: FormSubmission = {
      id: data.id,
      formId: data.formId,
      contentType: data.contentType,
      contentId: data.contentId,
      submissionDate: data.submissionDate,
      submittedBy: data.submittedBy,
      revisionDate: data.revisionDate,
      revisedBy: data.revisedBy
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    console.log("Converting Form Submissions", data.length);
    return CollectionHelper.convertAll<FormSubmission>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
