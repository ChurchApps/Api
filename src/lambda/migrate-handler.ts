import { Environment } from "../shared/helpers/Environment.js";
import { MigrationRunner, type ModuleMigrationRun } from "../shared/helpers/MigrationRunner.js";
import { MIGRATION_MODULES } from "../shared/helpers/MigrationFiles.js";

export interface MigrateResult {
  ok: boolean;
  environment: string;
  modules: ModuleMigrationRun[];
}

/**
 * Apply every pending migration in every module. The deploy workflows invoke this function
 * right after `serverless deploy`, because the production databases only accept connections
 * from inside the VPC the Lambda runs in - a GitHub runner cannot reach them.
 *
 * Same runner and the same kysely_migration table as Server Admin and `yarn migrate`.
 * `ok` is false when any module failed or was refused (no migration history), so the
 * workflow fails the deploy instead of leaving the schema behind the code.
 */
export const handleMigrate = async (): Promise<MigrateResult> => {
  const modules: ModuleMigrationRun[] = [];
  for (const moduleName of MIGRATION_MODULES) {
    const run = await MigrationRunner.run(moduleName);
    modules.push(run);
    if (run.applied.length) console.log(`[migrate] ${moduleName}: applied ${run.applied.join(", ")}`);
    else if (!run.error) console.log(`[migrate] ${moduleName}: up to date`);
    if (run.error) console.error(`[migrate] ${moduleName}: ${run.failed ? `${run.failed} failed - ` : ""}${run.error}`);
  }
  return { ok: modules.every((m) => !m.error), environment: Environment.currentEnvironment, modules };
};
