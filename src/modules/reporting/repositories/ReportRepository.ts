import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";

@injectable()
export class ReportRepository {
  public async run(db: string, sql: string, parameters: any[]): Promise<any[]> {
    return TypedDB.queryModule(db, sql, parameters);
  }
}
