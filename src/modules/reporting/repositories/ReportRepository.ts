import { DB } from "../../../shared/infrastructure";

export class ReportRepository {
  public async run(db: string, sql: string, parameters: any[]) {
    return DB.queryModule(db, sql, parameters);
  }
}
