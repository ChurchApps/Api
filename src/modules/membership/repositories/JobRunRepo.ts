import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { JobRun } from "../models/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";

export class JobRunRepo {
  public async create(run: JobRun): Promise<JobRun> {
    run.id = UniqueIdHelper.shortId();
    await getDb().insertInto("jobRuns").values({
      id: run.id,
      jobName: run.jobName,
      status: run.status,
      startedAt: DateHelper.toMysqlDate(run.startedAt) as any,
      durationMs: run.durationMs,
      errorMessage: run.errorMessage
    }).execute();
    return run;
  }

  public async loadLatest(): Promise<JobRun[]> {
    const result = await sql<JobRun>`
      SELECT jr.* FROM jobRuns jr
      INNER JOIN (SELECT jobName, MAX(startedAt) AS maxStarted FROM jobRuns GROUP BY jobName) latest
        ON latest.jobName = jr.jobName AND latest.maxStarted = jr.startedAt
      ORDER BY jr.jobName
    `.execute(getDb());
    return result.rows as JobRun[];
  }

  public async loadRecentFailures(limit: number = 25): Promise<JobRun[]> {
    return getDb().selectFrom("jobRuns").selectAll()
      .where("status", "=", "failed")
      .orderBy("startedAt", "desc")
      .limit(Math.max(1, Math.min(limit, 100)))
      .execute() as Promise<JobRun[]>;
  }

  public async deleteOld(days: number = 30): Promise<void> {
    await getDb().deleteFrom("jobRuns").where("startedAt", "<", sql`DATE_SUB(NOW(), INTERVAL ${days} DAY)` as any).execute();
  }

  public convertToModel(data: any) { return data; }
  public convertAllToModel(data: any[]) { return data || []; }
}
