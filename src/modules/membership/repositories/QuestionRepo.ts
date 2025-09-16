import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Question } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class QuestionRepo extends ConfiguredRepo<Question> {
  protected get repoConfig(): RepoConfig<Question> {
    return {
      tableName: "questions",
      hasSoftDelete: true,
      removedColumn: "removed",
      columns: ["formId", "parentId", "title", "description", "fieldType", "placeholder", "sort", "required", "choices"],
      insertLiterals: { removed: "0" }
    };
  }
  protected async create(question: Question): Promise<Question> {
    (question as any).choices = JSON.stringify(question.choices);
    return super.create(question);
  }

  protected async update(question: Question): Promise<Question> {
    (question as any).choices = JSON.stringify(question.choices);
    return super.update(question);
  }

  public async delete(churchId: string, id: string) {
    const question = (await TypedDB.queryOne("SELECT formId, sort FROM questions WHERE id=?", [id])) as {
      formId: string;
      sort: number;
    };
    const result = await TypedDB.query("UPDATE questions SET sort=sort-1 WHERE formId=? AND sort>?;", [question.formId, +question.sort]);
    return TypedDB.query("UPDATE questions SET sort=CONCAT('d', sort), removed=1 WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadForForm(churchId: string, formId: string) {
    return TypedDB.query("SELECT * FROM questions WHERE churchId=? AND formId=? AND removed=0 ORDER BY sort;", [churchId, formId]);
  }

  public loadForUnrestrictedForm(formId: string) {
    return TypedDB.query("SELECT * FROM questions WHERE formId=? AND removed=0 ORDER BY sort;", [formId]);
  }

  public async moveQuestionUp(id: string) {
    const question = (await TypedDB.queryOne("SELECT formId, sort FROM questions WHERE id=?", [id])) as {
      formId: string;
      sort: number;
    };
    let result = await TypedDB.query("UPDATE questions SET sort=sort+1 WHERE formId=? AND sort=?;", [question.formId, +question.sort - 1]);
    result = await TypedDB.query("UPDATE questions SET sort=sort-1 WHERE id=?;", [id]);
  }

  public async moveQuestionDown(id: string) {
    const question = (await TypedDB.queryOne("SELECT formId, sort FROM questions WHERE id=?", [id])) as {
      formId: string;
      sort: number;
    };
    let result = await TypedDB.query("UPDATE questions SET sort=sort-1 WHERE formId=? AND sort=?;", [question.formId, +question.sort + 1]);
    result = await TypedDB.query("UPDATE questions SET sort=sort+1 WHERE id=?;", [id]);
  }

  protected rowToModel(row: any): Question {
    const result: Question = {
      id: row.id,
      churchId: row.churchId,
      formId: row.formId,
      parentId: row.parentId,
      title: row.title,
      description: row.description,
      fieldType: row.fieldType,
      placeholder: row.placeholder,
      required: row.required,
      sort: row.sort,
      choices: row.choices || []
    };
    if (typeof row.choices === "string") result.choices = JSON.parse(row.choices);
    else result.choices = row.choices;
    return result;
  }
}
