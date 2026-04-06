import { injectable } from "inversify";
import { CompiledQuery } from "kysely";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";

@injectable()
export class ReportRepo {
  public async run(moduleName: string, rawSql: string, parameters: any[]): Promise<any[]> {
    const db = KyselyPool.getDb(moduleName);
    const result = await db.executeQuery(CompiledQuery.raw(rawSql, parameters));
    return result.rows as any[];
  }
}
