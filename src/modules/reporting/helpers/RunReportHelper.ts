import { ArrayHelper } from "@churchapps/apihelper";
import { Parameter, Query, Report } from "../models/index.js";
import { Repos } from "../repositories/Repos.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";

export class RunReportHelper {
  public static async runAllQueries(report: Report) {
    let depth = 0;
    let keepGoing = true;
    while (keepGoing) {
      keepGoing = await RunReportHelper.runQueries(report, depth);
      if (keepGoing) RunReportHelper.populateQueryResultParameters(report, depth);
      depth++;
    }
  }

  private static populateQueryResultParameters(report: Report, depth: number) {
    report.parameters?.forEach((p) => {
      if (p.source === "query") {
        const table = p.sourceKey.split(".")[0];
        const field = p.sourceKey.split(".")[1];
        report.queries.forEach((q) => {
          if (q.keyName === table && q.depth === depth && q.value) {
            p.value = [];
            q.value.forEach((v) => {
              p.value.push(v[field]);
            });
          }
        });
      }
    });
  }

  private static async runQueries(report: Report, depth: number) {
    const queries: Query[] = ArrayHelper.getAll(report.queries, "depth", depth);
    if (queries.length > 0) {
      const promises: Promise<void>[] = [];
      queries.forEach((q) => {
        promises.push(this.runQuery(q, report));
      });
      await Promise.all(promises);
      return true;
    } else return false;
  }

  private static async runQuery(query: Query, report: Report) {
    const parameters: any[] = [];

    const storedSql = query.sqlLines.join(" ");

    storedSql.match(/:[A-Za-z0-9]{1,99}/g)?.forEach((m) => {
      const keyName = m.replace(":", "");
      const p: Parameter = ArrayHelper.getOne(report.parameters, "keyName", keyName);
      parameters.push(p.value);
    });

    let sql = storedSql;
    storedSql.match(/:[A-Za-z0-9]{1,99}/g)?.forEach((m) => {
      sql = sql.replace(m, "?");
    });

    const repos = await RepoManager.getRepos<Repos>("reporting");
    query.value = await repos.report.run(query.db, sql, parameters);
  }
}
