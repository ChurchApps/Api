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
      rules: model.rules ? JSON.stringify(model.rules) : null,
      scope: model.scope ?? "org",
      roleId: model.roleId ?? null,
      autoRefresh: model.autoRefresh ? 1 : 0,
      householdInclusion: model.householdInclusion ?? "none",
      notifyOnChange: model.notifyOnChange ? 1 : 0,
      actions: model.actions ? JSON.stringify(model.actions) : null,
      dateCreated: sql`NOW()` as any
    }).execute();
    return model;
  }

  private async update(model: List): Promise<List> {
    await getDb().updateTable("lists").set({
      name: model.name,
      category: model.category,
      conditions: JSON.stringify(model.conditions ?? {}),
      rules: model.rules ? JSON.stringify(model.rules) : null,
      scope: model.scope ?? "org",
      roleId: model.roleId ?? null,
      autoRefresh: model.autoRefresh ? 1 : 0,
      householdInclusion: model.householdInclusion ?? "none",
      notifyOnChange: model.notifyOnChange ? 1 : 0,
      actions: model.actions ? JSON.stringify(model.actions) : null,
      dateModified: sql`NOW()` as any
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async load(churchId: string, id: string): Promise<List> {
    const row = await getDb().selectFrom("lists").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst();
    return this.rowToModel(row);
  }

  // Private lists are visible only to their creator; org lists to everyone with access.
  public async loadAll(churchId: string, viewerPersonId?: string): Promise<List[]> {
    let query = getDb()
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
        "lists.rules as rules",
        "lists.scope as scope",
        "lists.roleId as roleId",
        "lists.autoRefresh as autoRefresh",
        "lists.householdInclusion as householdInclusion",
        "lists.notifyOnChange as notifyOnChange",
        "lists.actions as actions",
        "people.displayName as createdByPersonName"
      ])
      .orderBy("lists.category")
      .orderBy("lists.name");
    if (viewerPersonId !== undefined) {
      query = query.where((eb) => eb.or([
        eb("lists.scope", "is", null),
        eb("lists.scope", "!=", "private"),
        eb("lists.createdByPersonId", "=", viewerPersonId)
      ]));
    }
    const rows = await query.execute();
    return rows.map((r) => this.rowToModel(r));
  }

  public async loadAutoRefresh(): Promise<List[]> {
    const rows = await getDb().selectFrom("lists").selectAll().where("autoRefresh", "=", 1 as any).execute();
    return rows.map((r) => this.rowToModel(r));
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("listMembers").where("listId", "=", id).where("churchId", "=", churchId).execute();
    await getDb().deleteFrom("lists").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  private rowToModel(row: any): List {
    if (!row) return null;
    let conditions: any = {};
    try { conditions = JSON.parse(row.conditions ?? "{}"); } catch { conditions = {}; }
    let rules: any = null;
    try { rules = row.rules ? JSON.parse(row.rules) : null; } catch { rules = null; }
    let actions: any = null;
    try { actions = row.actions ? JSON.parse(row.actions) : null; } catch { actions = null; }
    return {
      id: row.id,
      churchId: row.churchId,
      createdByPersonId: row.createdByPersonId,
      name: row.name,
      category: row.category,
      createdByPersonName: row.createdByPersonName ?? undefined,
      conditions,
      rules: rules ?? undefined,
      scope: row.scope ?? "org",
      roleId: row.roleId ?? undefined,
      autoRefresh: !!row.autoRefresh,
      householdInclusion: row.householdInclusion ?? "none",
      notifyOnChange: !!row.notifyOnChange,
      actions: actions ?? undefined
    };
  }

  public convertToModel(_churchId: string, data: any) { return this.rowToModel(data); }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []).map((d) => this.rowToModel(d)); }
}
