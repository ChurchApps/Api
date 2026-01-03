import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";

@injectable()
export class ReportRepo {
  public async run(db: string, sql: string, parameters: any[]): Promise<any[]> {
    return TypedDB.queryModule(db, sql, parameters);
  }
}
