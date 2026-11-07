import { RepoManager } from "../infrastructure/RepoManager.js";

export class JobRunHelper {
  // Failures are recorded and swallowed so one broken job can't abort the rest of a timer batch.
  public static async run(jobName: string, fn: () => Promise<unknown>): Promise<void> {
    const startedAt = new Date();
    let status = "success";
    let errorMessage: string = null;
    let result: unknown;
    try {
      console.debug(`[job] ${jobName} starting`);
      result = await fn();
    } catch (error) {
      status = "failed";
      errorMessage = ((error as Error)?.stack || String(error)).substring(0, 5000);
      console.error(`[job] ${jobName} failed:`, error);
    }
    const durationMs = Date.now() - startedAt.getTime();
    // Timers fire every few minutes; only log at INFO when the run actually did something.
    const summary = result === undefined ? "" : ` result: ${JSON.stringify(result)}`;
    const log = status === "success" && !JobRunHelper.didWork(result) ? console.debug : console.info;
    log(`[job] ${jobName} ${status} in ${durationMs}ms${summary}`);
    try {
      const repos = await RepoManager.getRepos<any>("membership");
      await repos.jobRun.create({ jobName, status, startedAt, durationMs, errorMessage });
    } catch (recordError) {
      console.error(`[job] could not record run for ${jobName}:`, recordError);
    }
  }

  // A result counts as "work" unless it is empty or an object whose numbers are all zero.
  private static didWork(result: unknown): boolean {
    if (result === undefined || result === null) return false;
    if (typeof result !== "object") return true;
    const values = Object.values(result as Record<string, unknown>);
    if (values.length === 0) return false;
    return values.some((v) => (typeof v === "number" ? v !== 0 : v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)));
  }
}
