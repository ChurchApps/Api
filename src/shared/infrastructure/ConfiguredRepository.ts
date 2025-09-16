import { TypedDB } from "./TypedDB";
import { BaseRepository } from "./BaseRepository";

export interface RepoConfig<T> {
  tableName: string;
  defaultOrderBy?: string;
  hasSoftDelete?: boolean;
  idColumn?: string;
  churchIdColumn?: string;
  removedColumn?: string;
  // New pattern: Single column list used for both insert and update operations
  // This is the primary column configuration that should be used going forward
  columns?: (keyof T | string)[];
  // Legacy properties: Optional overrides for backward compatibility
  // If not provided, insertColumns and updateColumns will fall back to using 'columns'
  insertColumns?: (keyof T | string)[];
  updateColumns?: (keyof T | string)[];
  insertLiterals?: Record<string, string>; // column -> SQL literal (e.g., "NOW()", "0")
  updateLiterals?: Record<string, string>;
}

export abstract class ConfiguredRepository<T extends { [key: string]: any }> extends BaseRepository<T> {
  protected abstract get repoConfig(): RepoConfig<T>;

  protected async create(model: T): Promise<T> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    const { sql, params } = this.buildInsert(model);
    //console.log(sql, params);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: T): Promise<T> {
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected buildInsert(model: T): { sql: string; params: any[] } {
    const cfg = this.repoConfig;
    // Use insertColumns override if provided, otherwise use columns, fallback to insertColumns for backward compatibility
    const insertCols = cfg.insertColumns || cfg.columns || [];
    const cols: string[] = [this.idColumn, this.churchIdColumn, ...insertCols.map(String)];
    const literals = cfg.insertLiterals || {};
    Object.keys(literals).forEach((c) => {
      if (!cols.includes(c)) cols.push(c);
    });

    const placeholders: string[] = [];
    const params: any[] = [];
    cols.forEach((col) => {
      if (literals[col] !== undefined) {
        placeholders.push(literals[col]);
      } else {
        placeholders.push("?");
        params.push((model as any)[col]);
      }
    });

    const sql = `INSERT INTO ${this.table()} (${cols.join(", ")}) VALUES (${placeholders.join(", ")});`;
    return { sql, params };
  }

  protected buildUpdate(model: T): { sql: string; params: any[] } {
    const cfg = this.repoConfig;
    const sets: string[] = [];
    const params: any[] = [];
    const literals = cfg.updateLiterals || {};

    // Use updateColumns override if provided, otherwise use columns, fallback to updateColumns for backward compatibility
    const updateCols = cfg.updateColumns || cfg.columns || [];
    updateCols.forEach((c) => {
      const col = String(c);
      sets.push(`${col}=?`);
      params.push((model as any)[col]);
    });
    Object.keys(literals).forEach((c) => {
      sets.push(`${c}=${literals[c]}`);
    });

    const where = ` WHERE ${this.idColumn}=? and ${this.churchIdColumn}=?`;
    params.push((model as any)[this.idColumn], (model as any)[this.churchIdColumn]);
    const sql = `UPDATE ${this.table()} SET ${sets.join(", ")} ${where}`;
    return { sql, params };
  }

  // Make BaseRepository use config's table name
  protected table(): string {
    return this.repoConfig.tableName;
  }

  // Respect config soft-delete & default order when using inherited helpers
  public async delete(churchId: string, id: string) {
    const cfg = this.repoConfig;
    if (cfg.hasSoftDelete === false) {
      const sql = `DELETE FROM ${this.table()} WHERE ${this.idColumn}=? AND ${this.churchIdColumn}=?;`;
      return TypedDB.query(sql, [id, churchId]);
    }
    return this.deleteSoft(churchId, id);
  }

  public async loadMany(churchId: string, orderBy?: string, includeRemoved = false) {
    const cfg = this.repoConfig;
    const removedClause = cfg.hasSoftDelete !== false && !includeRemoved ? ` AND ${this.removedColumn}=0` : "";
    const order = orderBy || cfg.defaultOrderBy;
    const orderClause = order ? ` ORDER BY ${order}` : "";
    const sql = `SELECT * FROM ${this.table()} WHERE ${this.churchIdColumn}=?${removedClause}${orderClause};`;
    const result = await TypedDB.query(sql, [churchId]);
    return result as any[];
  }

  public saveAll(models: T[]) {
    const promises: Promise<T>[] = [];
    models.forEach((model) => {
      promises.push(this.save(model));
    });
    return Promise.all(promises);
  }
}
