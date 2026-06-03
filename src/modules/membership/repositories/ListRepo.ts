import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { List } from "../models/index.js";

@injectable()
export class ListRepo {
  public async save(model: List) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: List): Promise<List> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("lists").values({
      id: model.id,
      churchId: model.churchId,
      createdByPersonId: model.createdByPersonId,
      name: model.name,
      category: model.category,
      conditions: JSON.stringify(model.conditions ?? {}),
      dateCreated: sql`NOW()` as any
    }).execute();
    return model;
  }

  private async update(model: List): Promise<List> {
    await getDb().updateTable("lists").set({
      name: model.name,
      category: model.category,
      conditions: JSON.stringify(model.conditions ?? {}),
      dateModified: sql`NOW()` as any
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async load(churchId: string, id: string): Promise<List> {
    const row = await getDb().selectFrom("lists").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst();
    return this.rowToModel(row);
  }

  public async loadAll(churchId: string): Promise<List[]> {
    const rows = await getDb()
      .selectFrom("lists")
      .leftJoin("people", "people.id", "lists.createdByPersonId")
      .where("lists.churchId", "=", churchId)
      .select([
        "lists.id as id",
        "lists.churchId as churchId",
        "lists.createdByPersonId as createdByPersonId",
        "lists.name as name",
        "lists.category as category",
        "lists.conditions as conditions",
        "people.displayName as createdByPersonName"
      ])
      .orderBy("lists.category")
      .orderBy("lists.name")
      .execute();
    return rows.map((r) => this.rowToModel(r));
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("lists").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  private rowToModel(row: any): List {
    if (!row) return null;
    let conditions: any = {};
    try { conditions = JSON.parse(row.conditions ?? "{}"); } catch { conditions = {}; }
    return {
      id: row.id,
      churchId: row.churchId,
      createdByPersonId: row.createdByPersonId,
      name: row.name,
      category: row.category,
      createdByPersonName: row.createdByPersonName ?? undefined,
      conditions
    };
  }

  public convertToModel(_churchId: string, data: any) { return this.rowToModel(data); }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []).map((d) => this.rowToModel(d)); }
}
