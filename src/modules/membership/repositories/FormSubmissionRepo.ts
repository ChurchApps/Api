import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { FormSubmission } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class FormSubmissionRepo extends ConfiguredRepo<FormSubmission> {
  protected get repoConfig(): RepoConfig<FormSubmission> {
    return {
      tableName: "formSubmissions",
      hasSoftDelete: false,
      insertColumns: ["formId", "contentType", "contentId", "submissionDate", "submittedBy", "revisionDate", "revisedBy"],
      updateColumns: ["contentId", "revisedBy"],
      updateLiterals: { revisionDate: "NOW()" }
    };
  }
  protected async create(formSubmission: FormSubmission): Promise<FormSubmission> {
    (formSubmission as any).submissionDate = DateHelper.toMysqlDate(formSubmission.submissionDate);
    (formSubmission as any).revisionDate = DateHelper.toMysqlDate(formSubmission.revisionDate);
    return super.create(formSubmission);
  }

  public loadForContent(churchId: string, contentType: string, contentId: string) {
    return TypedDB.query("SELECT * FROM formSubmissions WHERE churchId=? AND contentType=? AND contentId=?;", [churchId, contentType, contentId]);
  }

  public loadByFormId(churchId: string, formId: string) {
    return TypedDB.query("SELECT * FROM formSubmissions WHERE churchId=? AND formId=?;", [churchId, formId]);
  }

  protected rowToModel(row: any): FormSubmission {
    return {
      id: row.id,
      churchId: row.churchId,
      formId: row.formId,
      contentType: row.contentType,
      contentId: row.contentId,
      submissionDate: row.submissionDate,
      submittedBy: row.submittedBy,
      revisionDate: row.revisionDate,
      revisedBy: row.revisedBy
    };
  }
}
