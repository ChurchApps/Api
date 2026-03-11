import { eq, and } from "drizzle-orm";
import type { MySqlTableWithColumns } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDrizzleDb } from "../../db/drizzle.js";

/**
 * Base for any repo backed by a Drizzle table in a named module.
 * Provides the db connection and `executeRows()` helper.
 *
 * Use `DrizzleRepo` (below) for tables with `id` + `churchId`.
 * Use `GlobalDrizzleRepo` for tables with `id` only (no churchId).
 */
abstract class BaseDrizzleRepo<TTable extends MySqlTableWithColumns<any>> {
  protected abstract readonly table: TTable;
  protected abstract readonly moduleName: string;

  protected get db(): MySql2Database {
    return getDrizzleDb(this.moduleName);
  }

  /**
   * Execute a raw SQL query and return the rows array.
   * Unwraps the mysql2 [rows, fields] tuple that db.execute() returns.
   */
  protected async executeRows(query: any): Promise<any[]> {
    const result = await this.db.execute(query);
    return (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result as any[];
  }

  /** Default passthrough — override in repos that need row-to-model transformation. */
  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any) { return Array.isArray(data) ? data : []; }
}

/**
 * Base repository for tables that have `id` and `churchId` columns.
 * Provides standard CRUD: save, delete, load, loadOne, loadAll.
 *
 * Set `protected readonly softDelete = true` in subclasses whose table has a
 * `removed` column.  When enabled:
 *   - `delete()` sets `removed = 1` instead of deleting the row.
 *   - `load()`, `loadOne()`, and `loadAll()` automatically exclude removed rows.
 */
export abstract class DrizzleRepo<TTable extends MySqlTableWithColumns<any>> extends BaseDrizzleRepo<TTable> {
  /** Override to `true` for tables with a `removed` column. */
  protected readonly softDelete: boolean = false;

  public async save(model: any) {
    if (model.id) {
      const { id: _id, churchId: _cid, ...setData } = model;
      await this.db.update(this.table).set(setData).where(and(eq(this.table.id, model.id), eq(this.table.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      const values = this.softDelete ? { ...model, removed: false } : model;
      await this.db.insert(this.table).values(values);
    }
    return model;
  }

  public async delete(churchId: string, id: string) {
    if (this.softDelete) {
      await this.db.update(this.table).set({ removed: true } as any).where(and(eq(this.table.id, id), eq(this.table.churchId, churchId)));
    } else {
      await this.db.delete(this.table).where(and(eq(this.table.id, id), eq(this.table.churchId, churchId)));
    }
  }

  public loadOne(churchId: string, id: string): Promise<any> {
    const conditions = [eq(this.table.id, id), eq(this.table.churchId, churchId)];
    if (this.softDelete) conditions.push(eq(this.table.removed, false));
    return this.db.select().from(this.table).where(and(...conditions)).then(r => r[0] ?? null);
  }

  public load(churchId: string, id: string): Promise<any> {
    return this.loadOne(churchId, id);
  }

  public loadAll(churchId: string): Promise<any[]> {
    const conditions = [eq(this.table.churchId, churchId)];
    if (this.softDelete) conditions.push(eq(this.table.removed, false));
    return this.db.select().from(this.table).where(and(...conditions));
  }
}

/**
 * Base repository for global tables that have `id` but no `churchId`.
 * Provides save, delete, load, loadAll keyed by `id` only.
 */
export abstract class GlobalDrizzleRepo<TTable extends MySqlTableWithColumns<any>> extends BaseDrizzleRepo<TTable> {

  public async save(model: any) {
    if (model.id) {
      const { id: _id, ...setData } = model;
      await this.db.update(this.table).set(setData).where(eq(this.table.id, model.id));
    } else {
      model.id = UniqueIdHelper.shortId();
      await this.db.insert(this.table).values(model);
    }
    return model;
  }

  public async delete(id: string) {
    await this.db.delete(this.table).where(eq(this.table.id, id));
  }

  public load(id: string): Promise<any> {
    return this.db.select().from(this.table).where(eq(this.table.id, id)).then(r => r[0] ?? null);
  }

  public loadAll(): Promise<any[]> {
    return this.db.select().from(this.table);
  }
}
