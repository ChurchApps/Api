import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { EmailTemplate } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class EmailTemplateRepo extends ConfiguredRepo<EmailTemplate> {
  protected get repoConfig(): RepoConfig<EmailTemplate> {
    return {
      tableName: "emailTemplates",
      hasSoftDelete: false,
      columns: ["name", "subject", "htmlContent", "category"],
      insertLiterals: { dateCreated: "NOW()", dateModified: "NOW()" },
      updateLiterals: { dateModified: "NOW()" }
    };
  }

  public loadByChurchId(churchId: string) {
    return TypedDB.query("SELECT id, churchId, name, subject, category, dateCreated, dateModified FROM emailTemplates WHERE churchId=? ORDER BY name", [churchId]);
  }

  public loadById(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM emailTemplates WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM emailTemplates WHERE id=? AND churchId=?;", [id, churchId]);
  }

  protected rowToModel(data: any): EmailTemplate {
    return {
      id: data.id,
      churchId: data.churchId,
      name: data.name,
      subject: data.subject,
      htmlContent: data.htmlContent,
      category: data.category,
      dateCreated: data.dateCreated,
      dateModified: data.dateModified
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }
}
