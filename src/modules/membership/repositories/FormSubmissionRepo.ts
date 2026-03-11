import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { formSubmissions } from "../../../db/schema/membership.js";
import { FormSubmission } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";

@injectable()
export class FormSubmissionRepo extends DrizzleRepo<typeof formSubmissions> {
  protected readonly table = formSubmissions;
  protected readonly moduleName = "membership";

  public async save(model: FormSubmission) {
    if (model.id) {
      return this.update(model);
    } else {
      return this.create(model);
    }
  }

  private async create(formSubmission: FormSubmission): Promise<FormSubmission> {
    formSubmission.id = UniqueIdHelper.shortId();
    const data: any = {
      ...formSubmission,
      submissionDate: DateHelper.toMysqlDate(formSubmission.submissionDate),
      revisionDate: DateHelper.toMysqlDate(formSubmission.revisionDate)
    };
    await this.db.insert(formSubmissions).values(data);
    return formSubmission;
  }

  private async update(formSubmission: FormSubmission): Promise<FormSubmission> {
    const data: any = {
      contentId: formSubmission.contentId,
      revisedBy: formSubmission.revisedBy,
      revisionDate: new Date()
    };
    await this.db.update(formSubmissions).set(data)
      .where(and(eq(formSubmissions.id, formSubmission.id!), eq(formSubmissions.churchId, formSubmission.churchId!)));
    return formSubmission;
  }


  public loadForContent(churchId: string, contentType: string, contentId: string) {
    return this.db.select().from(formSubmissions)
      .where(and(eq(formSubmissions.churchId, churchId), eq(formSubmissions.contentType, contentType), eq(formSubmissions.contentId, contentId)));
  }

  public loadByFormId(churchId: string, formId: string) {
    return this.db.select().from(formSubmissions)
      .where(and(eq(formSubmissions.churchId, churchId), eq(formSubmissions.formId, formId)));
  }
}
