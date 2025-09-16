import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Answer } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { UniqueIdHelper } from "../helpers";

@injectable()
export class AnswerRepository {
  public save(answer: Answer) {
    return answer.id ? this.update(answer) : this.create(answer);
  }

  private async create(answer: Answer) {
    answer.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO answers (id, churchId, formSubmissionId, questionId, value) VALUES (?, ?, ?, ?, ?);";
    const params = [answer.id, answer.churchId, answer.formSubmissionId, answer.questionId, answer.value];
    await TypedDB.query(sql, params);
    return answer;
  }

  private async update(answer: Answer) {
    const sql = "UPDATE answers SET formSubmissionId=?, questionId=?, value=? WHERE id=? and churchId=?";
    const params = [answer.formSubmissionId, answer.questionId, answer.value, answer.id, answer.churchId];
    await TypedDB.query(sql, params);
    return answer;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM answers WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public deleteForSubmission(churchId: string, formSubmissionId: string) {
    return TypedDB.query("DELETE FROM answers WHERE churchId=? AND formSubmissionId=?;", [churchId, formSubmissionId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM answers WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM answers WHERE churchId=?;", [churchId]);
  }

  public loadForFormSubmission(churchId: string, formSubmissionId: string) {
    return TypedDB.query("SELECT * FROM answers WHERE churchId=? AND formSubmissionId=?;", [churchId, formSubmissionId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Answer = {
      id: data.id,
      formSubmissionId: data.formSubmissionId,
      questionId: data.questionId,
      value: data.value
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Answer>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
