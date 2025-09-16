import { TypedDB } from "../../../shared/infrastructure/TypedDB";

export class ReportRepository {
  public async run(db: string, sql: string, parameters: any[]) {
    return TypedDB.queryModule(db, sql, parameters);
  }
}
