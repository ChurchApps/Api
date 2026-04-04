import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { ClientError } from "../models/index.js";

@injectable()
export class ClientErrorRepo {
  public async save(model: ClientError) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: ClientError): Promise<ClientError> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("clientErrors").values({
      id: model.id,
      churchId: model.churchId,
      application: model.application,
      errorTime: model.errorTime,
      userId: model.userId,
      originUrl: model.originUrl,
      errorType: model.errorType,
      message: model.message,
      details: model.details
    }).execute();
    return model;
  }

  private async update(model: ClientError): Promise<ClientError> {
    await getDb().updateTable("clientErrors").set({
      application: model.application,
      errorTime: model.errorTime,
      userId: model.userId,
      originUrl: model.originUrl,
      errorType: model.errorType,
      message: model.message,
      details: model.details
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async deleteOld() {
    await sql`DELETE FROM clientErrors WHERE errorTime < DATE_ADD(NOW(), INTERVAL -7 DAY)`.execute(getDb());
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("clientErrors").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(id: string) {
    return (await getDb().selectFrom("clientErrors").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadAll() {
    return getDb().selectFrom("clientErrors").selectAll().execute();
  }

  public saveAll(models: ClientError[]) {
    const promises: Promise<ClientError>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: ClientError): Promise<ClientError> {
    return this.create(model);
  }

  protected rowToModel(row: any): ClientError {
    return {
      id: row.id,
      application: row.application,
      errorTime: row.errorTime,
      userId: row.userId,
      churchId: row.churchId,
      originUrl: row.originUrl,
      errorType: row.errorType,
      message: row.message,
      details: row.details
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
