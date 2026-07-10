import { RepoManager } from "../infrastructure/RepoManager.js";

export class JobRunHelper {
  // Failures are recorded and swallowed so one broken job can't abort the rest of a timer batch.
  public static async run(jobName: string, fn: () => Promise<unknown>): Promise<void> {
    const startedAt = new Date();
    let status = "success";
    let errorMessage: string = null;
    try {
      console.log(`[job] ${jobName} starting`);
      const result = await fn();
      if (result !== undefined) console.log(`[job] ${jobName} result:`, JSON.stringify(result));
    } catch (error) {
      status = "failed";
      errorMessage = ((error as Error)?.stack || String(error)).substring(0, 5000);
      console.error(`[job] ${jobName} failed:`, error);
    }
    const durationMs = Date.now() - startedAt.getTime();
    console.log(`[job] ${jobName} ${status} in ${durationMs}ms`);
    try {
      const repos = await RepoManager.getRepos<any>("membership");
      await repos.jobRun.create({ jobName, status, startedAt, durationMs, errorMessage });
    } catch (recordError) {
      console.error(`[job] could not record run for ${jobName}:`, recordError);
    }
  }
}
