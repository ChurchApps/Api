import { DB } from "../../../shared/infrastructure";

export class TypedDB {
  static async query<T = any>(sql: string, params: unknown[]): Promise<T> {
    return DB.query(sql, params) as Promise<T>;
  }

  static async queryOne<T = any>(sql: string, params: unknown[]): Promise<T> {
    return DB.queryOne(sql, params) as Promise<T>;
  }
}
