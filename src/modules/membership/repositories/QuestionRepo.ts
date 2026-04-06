import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Question } from "../models/index.js";

@injectable()
export class QuestionRepo {
  public async save(model: Question) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(question: Question): Promise<Question> {
    question.id = UniqueIdHelper.shortId();
    const choices = JSON.stringify(question.choices);
    await getDb().insertInto("questions").values({
      id: question.id,
      churchId: question.churchId,
      formId: question.formId,
      parentId: question.parentId,
      title: question.title,
      description: question.description,
      fieldType: question.fieldType,
      placeholder: question.placeholder,
      sort: question.sort,
      required: question.required,
      choices: choices as any,
      removed: false as any
    }).execute();
    return question;
  }

  private async update(question: Question): Promise<Question> {
    const choices = JSON.stringify(question.choices);
    await getDb().updateTable("questions").set({
      formId: question.formId,
      parentId: question.parentId,
      title: question.title,
      description: question.description,
      fieldType: question.fieldType,
      placeholder: question.placeholder,
      sort: question.sort,
      required: question.required,
      choices: choices as any
    }).where("id", "=", question.id).where("churchId", "=", question.churchId).execute();
    return question;
  }

  public async delete(churchId: string, id: string) {
    const question = (await getDb().selectFrom("questions").select(["formId", "sort"]).where("id", "=", id).executeTakeFirst()) ?? null;
    await getDb().updateTable("questions").set({ sort: sql`sort-1` as any }).where("formId", "=", question.formId).where("sort", ">", +question.sort as any).execute();
    await getDb().updateTable("questions").set({ sort: sql`CONCAT('d', sort)` as any, removed: 1 as any }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("questions").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false as any).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("questions").selectAll().where("churchId", "=", churchId).where("removed", "=", false as any).orderBy("sort").execute();
  }

  public async loadForForm(churchId: string, formId: string) {
    return getDb().selectFrom("questions").selectAll()
      .where("churchId", "=", churchId)
      .where("formId", "=", formId)
      .where("removed", "=", false as any)
      .orderBy("sort")
      .execute();
  }

  public async loadForUnrestrictedForm(formId: string) {
    return getDb().selectFrom("questions").selectAll()
      .where("formId", "=", formId)
      .where("removed", "=", false as any)
      .orderBy("sort")
      .execute();
  }

  public async moveQuestionUp(id: string) {
    const question = (await getDb().selectFrom("questions").select(["formId", "sort"]).where("id", "=", id).executeTakeFirst()) ?? null;
    await getDb().updateTable("questions").set({ sort: sql`sort+1` as any }).where("formId", "=", question.formId).where("sort", "=", +question.sort - 1 as any).execute();
    await getDb().updateTable("questions").set({ sort: sql`sort-1` as any }).where("id", "=", id).execute();
  }

  public async moveQuestionDown(id: string) {
    const question = (await getDb().selectFrom("questions").select(["formId", "sort"]).where("id", "=", id).executeTakeFirst()) ?? null;
    await getDb().updateTable("questions").set({ sort: sql`sort-1` as any }).where("formId", "=", question.formId).where("sort", "=", +question.sort + 1 as any).execute();
    await getDb().updateTable("questions").set({ sort: sql`sort+1` as any }).where("id", "=", id).execute();
  }

  public saveAll(models: Question[]) {
    const promises: Promise<Question>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Question): Promise<Question> {
    return this.create(model);
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

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }
}
