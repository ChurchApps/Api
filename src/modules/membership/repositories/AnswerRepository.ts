import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Answer } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class AnswerRepository extends ConfiguredRepository<Answer> {
  protected get repoConfig(): RepoConfig<Answer> {
    return {
      tableName: "answers",
      hasSoftDelete: false,
      insertColumns: ["formSubmissionId", "questionId", "value"],
      updateColumns: ["formSubmissionId", "questionId", "value"]
    };
  }

  public deleteForSubmission(churchId: string, formSubmissionId: string) {
    return TypedDB.query("DELETE FROM answers WHERE churchId=? AND formSubmissionId=?;", [churchId, formSubmissionId]);
  }

  public loadForFormSubmission(churchId: string, formSubmissionId: string) {
    return TypedDB.query("SELECT * FROM answers WHERE churchId=? AND formSubmissionId=?;", [churchId, formSubmissionId]);
  }

  protected rowToModel(row: any): Answer {
    return {
      id: row.id,
      churchId: row.churchId,
      formSubmissionId: row.formSubmissionId,
      questionId: row.questionId,
      value: row.value
    };
  }
}
