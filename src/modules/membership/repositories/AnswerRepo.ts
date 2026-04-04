import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Answer } from "../models/index.js";

@injectable()
export class AnswerRepo {
  public async save(model: Answer) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Answer): Promise<Answer> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("answers").values({
      id: model.id,
      churchId: model.churchId,
      formSubmissionId: model.formSubmissionId,
      questionId: model.questionId,
      value: model.value
    }).execute();
    return model;
  }

  private async update(model: Answer): Promise<Answer> {
    await getDb().updateTable("answers").set({
      formSubmissionId: model.formSubmissionId,
      questionId: model.questionId,
      value: model.value
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("answers").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteForSubmission(churchId: string, formSubmissionId: string) {
    await getDb().deleteFrom("answers").where("churchId", "=", churchId).where("formSubmissionId", "=", formSubmissionId).execute();
  }

  public async loadForFormSubmission(churchId: string, formSubmissionId: string) {
    return getDb().selectFrom("answers").selectAll().where("churchId", "=", churchId).where("formSubmissionId", "=", formSubmissionId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("answers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("answers").selectAll().where("churchId", "=", churchId).execute();
  }

  public saveAll(models: Answer[]) {
    const promises: Promise<Answer>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Answer): Promise<Answer> {
    return this.create(model);
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

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }
}
