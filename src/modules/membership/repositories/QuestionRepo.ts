import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { questions } from "../../../db/schema/membership.js";
import { Question } from "../models/index.js";

@injectable()
export class QuestionRepo extends DrizzleRepo<typeof questions> {
  protected readonly table = questions;
  protected readonly moduleName = "membership";
  protected readonly softDelete = true;

  public async save(model: Question) {
    if (model.id) {
      return this.update(model);
    } else {
      return this.create(model);
    }
  }

  private async create(question: Question): Promise<Question> {
    question.id = UniqueIdHelper.shortId();
    const data: any = {
      ...question,
      choices: JSON.stringify(question.choices),
      removed: false
    };
    await this.db.insert(questions).values(data);
    return question;
  }

  private async update(question: Question): Promise<Question> {
    const data: any = {
      formId: question.formId,
      parentId: question.parentId,
      title: question.title,
      description: question.description,
      fieldType: question.fieldType,
      placeholder: question.placeholder,
      sort: question.sort,
      required: question.required,
      choices: JSON.stringify(question.choices)
    };
    await this.db.update(questions).set(data)
      .where(and(eq(questions.id, question.id!), eq(questions.churchId, question.churchId!)));
    return question;
  }

  public async delete(churchId: string, id: string) {
    const rows = await this.db.select({ formId: questions.formId, sort: questions.sort })
      .from(questions).where(eq(questions.id, id));
    const question = rows[0];
    if (question) {
      await this.db.execute(sql`UPDATE questions SET sort = sort - 1 WHERE formId = ${question.formId} AND sort > ${question.sort}`);
      await this.db.execute(sql`UPDATE questions SET removed = 1 WHERE id = ${id} AND churchId = ${churchId}`);
    }
  }

  public load(churchId: string, id: string) {
    return this.db.select().from(questions)
      .where(and(eq(questions.id, id), eq(questions.churchId, churchId), eq(questions.removed, false)))
      .then(r => r[0] ? this.rowToModel(r[0]) : null);
  }

  public loadAll(churchId: string) {
    return this.db.select().from(questions)
      .where(and(eq(questions.churchId, churchId), eq(questions.removed, false)));
  }

  public loadForForm(churchId: string, formId: string) {
    return this.db.select().from(questions)
      .where(and(eq(questions.churchId, churchId), eq(questions.formId, formId), eq(questions.removed, false)))
      .orderBy(questions.sort)
      .then((rows: any) => rows.map((r: any) => this.rowToModel(r)));
  }

  public loadForUnrestrictedForm(formId: string) {
    return this.db.select().from(questions)
      .where(and(eq(questions.formId, formId), eq(questions.removed, false)))
      .orderBy(questions.sort)
      .then((rows: any) => rows.map((r: any) => this.rowToModel(r)));
  }



  public async moveQuestionUp(id: string) {
    const rows = await this.db.select({ formId: questions.formId, sort: questions.sort })
      .from(questions).where(eq(questions.id, id));
    const question = rows[0];
    if (question) {
      await this.db.execute(sql`UPDATE questions SET sort = sort + 1 WHERE formId = ${question.formId} AND sort = ${+question.sort! - 1}`);
      await this.db.execute(sql`UPDATE questions SET sort = sort - 1 WHERE id = ${id}`);
    }
  }

  public async moveQuestionDown(id: string) {
    const rows = await this.db.select({ formId: questions.formId, sort: questions.sort })
      .from(questions).where(eq(questions.id, id));
    const question = rows[0];
    if (question) {
      await this.db.execute(sql`UPDATE questions SET sort = sort - 1 WHERE formId = ${question.formId} AND sort = ${+question.sort! + 1}`);
      await this.db.execute(sql`UPDATE questions SET sort = sort + 1 WHERE id = ${id}`);
    }
  }

  private rowToModel(row: any): Question {
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
