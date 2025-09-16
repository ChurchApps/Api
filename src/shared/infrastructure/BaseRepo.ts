import { TypedDB } from "./TypedDB";
import { rowsToArray } from "../helpers/DbArrayHelper";
import { UniqueIdHelper } from "@churchapps/apihelper";

/**
 * Generic base repository with common helpers for simple tables.
 * Subclasses should provide `tableName`, and implement `create`/`update` and `convertToModel`.
 */
export abstract class BaseRepo<T> {
  protected tableName = "";

  // Common column names; override in subclass if different
  protected idColumn = "id";
  protected churchIdColumn = "churchId";
  protected removedColumn = "removed";
  protected hasSoftDelete = true;
  protected defaultOrderBy?: string;
  // Allow subclasses to override soft delete behavior
  protected getHasSoftDelete(): boolean {
    return this.hasSoftDelete;
  }

  // Allow subclasses to override default order by
  protected getDefaultOrderBy(): string | undefined {
    return this.defaultOrderBy;
  }

  // Allow subclasses to override how the table name is resolved
  protected table(): string {
    return this.tableName;
  }

  // Optional row->model mapper. Subclasses can override for convenience.
  protected rowToModel(row: any): T {
    return row as T;
  }

  // Convenience: convert any DB result to an array of models using rowToModel
  public mapToModels(data: any): T[] {
    return this.convertAll(rowsToArray(data), (r) => this.rowToModel(r));
  }

  // Default converters to match repository usage patterns
  public convertToModel(churchId: string, data: any): T {
    return this.rowToModel(data);
  }

  public convertAllToModel(churchId: string, data: any): T[] {
    return this.mapToModels(data);
  }

  /**
   * Default save toggles create vs update by presence of id
   */
  public save(model: T & { id?: string }) {
    return (model as any)[this.idColumn] ? this.update(model as T) : this.create(model as T);
  }

  /**
   * Implemented by subclasses to insert a new row
   */
  protected abstract create(model: T): Promise<T>;

  /**
   * Implemented by subclasses to update an existing row
   */
  protected abstract update(model: T): Promise<T>;

  /**
   * Create a short unique id for new records
   */
  public createId(): string {
    return UniqueIdHelper.shortId();
  }

  /**
   * Standard soft delete helper (sets removed=1)
   */
  public async deleteSoft(churchId: string, id: string) {
    if (!this.getHasSoftDelete()) throw new Error("Soft delete not enabled for this repository");
    const sql = `UPDATE ${this.table()} SET ${this.removedColumn}=1 WHERE ${this.idColumn}=? AND ${this.churchIdColumn}=?;`;
    return TypedDB.query(sql, [id, churchId]);
  }

  /**
   * Default delete method: soft delete when enabled, otherwise hard delete
   */
  public async delete(churchId: string, id: string) {
    if (this.getHasSoftDelete()) return this.deleteSoft(churchId, id);
    const sql = `DELETE FROM ${this.tableName} WHERE ${this.idColumn}=? AND ${this.churchIdColumn}=?;`;
    return TypedDB.query(sql, [id, churchId]);
  }

  /**
   * Load a single row by id for a church, optionally including removed rows
   */
  public async loadOne(churchId: string, id: string, includeRemoved = false) {
    const removedClause = this.getHasSoftDelete() && !includeRemoved ? ` AND ${this.removedColumn}=0` : "";
    const sql = `SELECT * FROM ${this.table()} WHERE ${this.idColumn}=? AND ${this.churchIdColumn}=?${removedClause};`;
    return TypedDB.queryOne(sql, [id, churchId]);
  }

  /**
   * Load all rows for a church, optionally including removed, and optional order by
   */
  public async loadMany(churchId: string, orderBy?: string, includeRemoved = false) {
    const removedClause = this.getHasSoftDelete() && !includeRemoved ? ` AND ${this.removedColumn}=0` : "";
    const order = orderBy || this.getDefaultOrderBy();
    const orderClause = order ? ` ORDER BY ${order}` : "";
    const sql = `SELECT * FROM ${this.table()} WHERE ${this.churchIdColumn}=?${removedClause}${orderClause};`;
    const result = await TypedDB.query(sql, [churchId]);
    return rowsToArray(result);
  }

  /**
   * Aliases matching common repository method names
   */
  public load(churchId: string, id: string) {
    return this.loadOne(churchId, id);
  }

  public loadAll(churchId: string) {
    return this.loadMany(churchId);
  }

  /**
   * Convert an array of rows to models using either the subclass converter
   * or a provided converter function.
   */
  public convertAll(rows: any[], converter: (row: any) => T): T[] {
    const arr = rowsToArray(rows);
    return arr.map((r) => converter(r));
  }
}
