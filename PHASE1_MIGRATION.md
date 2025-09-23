# Phase 1 Multi-Gateway Migration Instructions

Follow these steps when you are ready to run the database migration for Phase 1.

## 1. Prep
- Confirm the API build you plan to deploy contains the Phase 1 schema changes and migration script.
- Ensure the target environment variables expose a `giving` database connection via `GIVING_CONNECTION_STRING` or the legacy config files.
- Back up the target database (snapshot or dump) in case you need to roll back.

## 2. Dry Run (recommended)
Run the migration in dry-run mode to verify it can reach the database and list the SQL it would execute. Replace `<env>` with the environment (for example `staging` or `prod`).

```bash
ts-node tools/dbScripts/giving/migrations/phase1-multigateway.ts --dry-run --env=<env>
```

Review the output to confirm there are no validation errors and that the planned operations look correct.

## 3. Execute Migration
When ready, rerun without `--dry-run`:

```bash
ts-node tools/dbScripts/giving/migrations/phase1-multigateway.ts --env=<env>
```

The script will:
1. Add `settings`, `environment`, `createdAt`, and `updatedAt` columns to `gateways` if missing.
2. Add `provider` and `metadata` columns to `customers` if missing.
3. Create the `gatewayPaymentMethods` table when it does not already exist.
4. Backfill `customers.provider` from the church gateway, defaulting to `stripe`.
5. Fail fast if any church already has more than one gateway row.

## 4. Post-Migration Checks
- Inspect the log output for `✅` confirmation and ensure no `❌` messages appear.
- Spot-check a few churches to confirm `gateways.settings` and `customers.provider` look correct.
- If you rely on automated schema diff tooling, rerun it now to confirm the schema matches expectations.

## 5. Rollback Guidance
If an issue occurs and you need to revert:
- Restore the database backup/snapshot captured in step 1.
- Investigate and resolve the issue (for example, duplicate gateway rows) before running the migration again.

Keep this file with the release branch so the deployment team has clear instructions on running the Phase 1 migration.
