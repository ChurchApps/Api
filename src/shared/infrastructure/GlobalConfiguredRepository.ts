import { BaseRepository } from "./BaseRepository";
import { TypedDB } from "./TypedDB";

export interface GlobalRepoConfig<T> {
  tableName: string;
  defaultOrderBy?: string;
  hasSoftDelete?: boolean;
  hasChurchId?: boolean; // Whether the table has a churchId column
  idColumn?: string;
  // New pattern: Single column list used for both insert and update operations
  // This is the primary column configuration that should be used going forward
  columns?: (keyof T | string)[];
  // Legacy properties: Optional overrides for backward compatibility
  // If not provided, insertColumns and updateColumns will fall back to using 'columns'
  insertColumns?: (keyof T | string)[]; // Override for insert if different from columns
  updateColumns?: (keyof T | string)[]; // Override for update if different from columns
  insertLiterals?: Record<string, string>; // column -> SQL literal (e.g., "NOW()", "0")
  updateLiterals?: Record<string, string>;
}

export abstract class GlobalConfiguredRepository<T extends { [key: string]: any }> extends BaseRepository<T> {
  protected abstract get repoConfig(): GlobalRepoConfig<T>;

  protected async create(model: T): Promise<T> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: T): Promise<T> {
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public saveAll(models: T[]) {
    const promises: Promise<T>[] = [];
    models.forEach((m) => {
      promises.push(this.save(m));
    });
    return Promise.all(promises);
  }

  protected buildInsert(model: T): { sql: string; params: any[] } {
    const cfg = this.repoConfig;
    // Use insertColumns override if provided, otherwise use columns, fallback to insertColumns for backward compatibility
    const insertCols = cfg.insertColumns || cfg.columns || [];
    const cols: string[] = [this.idColumn, ...insertCols.map(String)];

    // Automatically include churchId if the table has it
    if (cfg.hasChurchId && !cols.includes("churchId")) {
      cols.push("churchId");
    }

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
      // Skip churchId in updates - it should never be changed after creation
      if (cfg.hasChurchId && col === "churchId") {
        return;
      }
      sets.push(`${col}=?`);
      params.push((model as any)[col]);
    });
    Object.keys(literals).forEach((c) => {
      sets.push(`${c}=${literals[c]}`);
    });

    // Build WHERE clause - include churchId if the table has it
    let where = ` WHERE ${this.idColumn}=?`;
    params.push((model as any)[this.idColumn]);

    if (cfg.hasChurchId) {
      where += " AND churchId=?";
      params.push((model as any).churchId);
    }

    const sql = `UPDATE ${this.table()} SET ${sets.join(", ")} ${where}`;
    return { sql, params };
  }

  // Make BaseRepository use config's table name
  protected table(): string {
    return this.repoConfig.tableName;
  }

  // Global delete method (no churchId)
  public async delete(id: string) {
    const cfg = this.repoConfig;
    if (cfg.hasSoftDelete === false) {
      const sql = `DELETE FROM ${this.table()} WHERE ${this.idColumn}=?;`;
      return TypedDB.query(sql, [id]);
    }
    throw new Error("Soft delete not implemented for global repositories");
  }

  // Global load method (no churchId)
  public load(id: string) {
    return TypedDB.queryOne(`SELECT * FROM ${this.table()} WHERE ${this.idColumn}=?;`, [id]);
  }

  // Global loadMany method (no churchId)
  public async loadMany(orderBy?: string) {
    const cfg = this.repoConfig;
    const order = orderBy || cfg.defaultOrderBy;
    const orderClause = order ? ` ORDER BY ${order}` : "";
    const sql = `SELECT * FROM ${this.table()}${orderClause};`;
    const result = await TypedDB.query(sql, []);
    return result as any[];
  }
}
