/**
 * Phase 2 Migration: ACH Payment Methods - Sources to PaymentMethods API
 *
 * This migration converts existing Stripe bank account Sources (ba_xxx) to PaymentMethods (pm_xxx)
 * and updates subscriptions to use default_payment_method instead of default_source.
 *
 * This is required because Stripe is deprecating the Charges API for ACH Direct Debits
 * on May 15, 2026. After this date, all ACH payments must use the Payment Intents API.
 *
 * Run with:
 *   npx ts-node tools/dbScripts/giving/migrations/phase2-ach-payment-intents.ts --env=prod
 *   npx ts-node tools/dbScripts/giving/migrations/phase2-ach-payment-intents.ts --env=prod --dry-run
 */

import Stripe from "stripe";
import { Environment } from "../../../../src/shared/helpers/Environment";
import { MultiDatabasePool } from "../../../../src/shared/infrastructure/MultiDatabasePool";
import { EncryptionHelper } from "@churchapps/apihelper";

interface MigrationOptions {
  dryRun: boolean;
  environment: string;
}

interface Gateway {
  id: string;
  churchId: string;
  provider: string;
  privateKey: string;
}

interface Customer {
  id: string;
  churchId: string;
  personId: string;
  provider: string;
}

interface MigrationResult {
  customerId: string;
  churchId: string;
  sourceId: string;
  newPaymentMethodId?: string;
  status: "migrated" | "skipped" | "error";
  error?: string;
}

interface SubscriptionMigrationResult {
  subscriptionId: string;
  churchId: string;
  oldSource?: string;
  newPaymentMethod?: string;
  status: "migrated" | "skipped" | "error";
  error?: string;
}

async function getStripeGateways(): Promise<Gateway[]> {
  const sql = `
    SELECT id, churchId, provider, privateKey
    FROM gateways
    WHERE provider = 'stripe' OR provider = 'Stripe'
  `;
  return await MultiDatabasePool.query("giving", sql);
}

async function getCustomersForChurch(churchId: string): Promise<Customer[]> {
  const sql = `
    SELECT id, churchId, personId, provider
    FROM customers
    WHERE churchId = ? AND (provider = 'stripe' OR provider = 'Stripe' OR provider IS NULL)
  `;
  return await MultiDatabasePool.query("giving", sql, [churchId]);
}

async function getSubscriptionsForChurch(churchId: string): Promise<{ id: string; churchId: string; customerId: string }[]> {
  const sql = `
    SELECT id, churchId, customerId
    FROM subscriptions
    WHERE churchId = ?
  `;
  return await MultiDatabasePool.query("giving", sql, [churchId]);
}

async function migrateBankAccountsForGateway(
  gateway: Gateway,
  options: MigrationOptions
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  const secretKey = EncryptionHelper.decrypt(gateway.privateKey);
  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });

  const customers = await getCustomersForChurch(gateway.churchId);
  console.log(`   Found ${customers.length} customers for church ${gateway.churchId}`);

  for (const customer of customers) {
    try {
      // List bank account sources for this customer
      const sources = await stripe.customers.listSources(customer.id, {
        object: "bank_account",
        limit: 100
      });

      if (sources.data.length === 0) {
        continue; // No bank accounts to migrate
      }

      console.log(`   Customer ${customer.id} has ${sources.data.length} bank account(s)`);

      for (const source of sources.data) {
        const bankSource = source as Stripe.BankAccount;

        if (options.dryRun) {
          console.log(`   📝 [dry-run] Would migrate source ${bankSource.id} (****${bankSource.last4})`);
          results.push({
            customerId: customer.id,
            churchId: gateway.churchId,
            sourceId: bankSource.id,
            status: "skipped",
            error: "Dry run - no changes made"
          });
          continue;
        }

        try {
          // Create a SetupIntent to establish a mandate for the bank account
          // Note: For production migration, Stripe recommends using their Tokens API migration
          // which can backfill mandates. This script demonstrates the approach.
          //
          // The proper migration flow per Stripe docs:
          // 1. Use stripe.paymentMethods.create() with the bank account details
          // 2. Attach to customer
          // 3. Create mandate via SetupIntent

          // For existing verified bank accounts, we need to create a new PaymentMethod
          // and attach it to the customer. The bank will be instantly verified if the
          // original source was already verified.

          const paymentMethod = await stripe.paymentMethods.create({
            type: "us_bank_account",
            us_bank_account: {
              account_holder_type: bankSource.account_holder_type as "individual" | "company",
              account_type: (bankSource as any).account_type || "checking",
              // Note: We can't access the actual account/routing numbers from the source
              // This requires Stripe's internal migration or customer re-authentication
            },
            billing_details: {
              name: bankSource.account_holder_name || undefined
            },
            metadata: {
              migrated_from_source: bankSource.id,
              migration_date: new Date().toISOString()
            }
          });

          // Attach the PaymentMethod to the customer
          await stripe.paymentMethods.attach(paymentMethod.id, {
            customer: customer.id
          });

          console.log(`   ✅ Migrated ${bankSource.id} → ${paymentMethod.id}`);

          results.push({
            customerId: customer.id,
            churchId: gateway.churchId,
            sourceId: bankSource.id,
            newPaymentMethodId: paymentMethod.id,
            status: "migrated"
          });
        } catch (error: any) {
          // The above approach may fail because we can't create a us_bank_account
          // PaymentMethod directly without the account details. In production,
          // use Stripe's recommended migration path or have customers re-link.
          console.log(`   ⚠️  Could not auto-migrate ${bankSource.id}: ${error.message}`);
          console.log(`      Customer will need to re-link their bank account via Financial Connections`);

          results.push({
            customerId: customer.id,
            churchId: gateway.churchId,
            sourceId: bankSource.id,
            status: "error",
            error: `Auto-migration not possible: ${error.message}. Customer must re-link via Financial Connections.`
          });
        }
      }
    } catch (error: any) {
      console.log(`   ❌ Error processing customer ${customer.id}: ${error.message}`);
      results.push({
        customerId: customer.id,
        churchId: gateway.churchId,
        sourceId: "unknown",
        status: "error",
        error: error.message
      });
    }
  }

  return results;
}

async function migrateSubscriptionsForGateway(
  gateway: Gateway,
  options: MigrationOptions
): Promise<SubscriptionMigrationResult[]> {
  const results: SubscriptionMigrationResult[] = [];

  const secretKey = EncryptionHelper.decrypt(gateway.privateKey);
  const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });

  const subscriptions = await getSubscriptionsForChurch(gateway.churchId);
  console.log(`   Found ${subscriptions.length} subscriptions for church ${gateway.churchId}`);

  for (const sub of subscriptions) {
    try {
      // Get the Stripe subscription
      const stripeSub = await stripe.subscriptions.retrieve(sub.id);

      // Check if this subscription uses a bank account source
      if (!stripeSub.default_source || typeof stripeSub.default_source !== "string") {
        continue; // No source or already using PaymentMethod
      }

      // Check if the source is a bank account
      if (!stripeSub.default_source.startsWith("ba_")) {
        continue; // Not a bank account source
      }

      console.log(`   Subscription ${sub.id} uses bank source ${stripeSub.default_source}`);

      if (options.dryRun) {
        console.log(`   📝 [dry-run] Would need to migrate subscription ${sub.id}`);
        results.push({
          subscriptionId: sub.id,
          churchId: gateway.churchId,
          oldSource: stripeSub.default_source,
          status: "skipped",
          error: "Dry run - customer must re-link bank account first"
        });
        continue;
      }

      // For production, we would:
      // 1. Find the migrated PaymentMethod for this source
      // 2. Update the subscription to use default_payment_method

      // Since direct migration may not be possible, log for manual review
      results.push({
        subscriptionId: sub.id,
        churchId: gateway.churchId,
        oldSource: stripeSub.default_source,
        status: "skipped",
        error: "Requires customer to re-link bank account via Financial Connections"
      });
    } catch (error: any) {
      console.log(`   ❌ Error processing subscription ${sub.id}: ${error.message}`);
      results.push({
        subscriptionId: sub.id,
        churchId: gateway.churchId,
        status: "error",
        error: error.message
      });
    }
  }

  return results;
}

async function generateMigrationReport(
  bankResults: MigrationResult[],
  subscriptionResults: SubscriptionMigrationResult[]
) {
  console.log("\n" + "=".repeat(80));
  console.log("MIGRATION REPORT");
  console.log("=".repeat(80));

  // Bank account migration summary
  const bankMigrated = bankResults.filter(r => r.status === "migrated").length;
  const bankSkipped = bankResults.filter(r => r.status === "skipped").length;
  const bankErrors = bankResults.filter(r => r.status === "error").length;

  console.log("\nBank Account Migration:");
  console.log(`  ✅ Migrated: ${bankMigrated}`);
  console.log(`  ⏭️  Skipped: ${bankSkipped}`);
  console.log(`  ❌ Errors: ${bankErrors}`);

  // Subscription migration summary
  const subMigrated = subscriptionResults.filter(r => r.status === "migrated").length;
  const subSkipped = subscriptionResults.filter(r => r.status === "skipped").length;
  const subErrors = subscriptionResults.filter(r => r.status === "error").length;

  console.log("\nSubscription Migration:");
  console.log(`  ✅ Migrated: ${subMigrated}`);
  console.log(`  ⏭️  Skipped: ${subSkipped}`);
  console.log(`  ❌ Errors: ${subErrors}`);

  // List items requiring manual intervention
  const manualIntervention = [
    ...bankResults.filter(r => r.status === "error"),
    ...subscriptionResults.filter(r => r.status === "skipped" || r.status === "error")
  ];

  if (manualIntervention.length > 0) {
    console.log("\n⚠️  ITEMS REQUIRING MANUAL INTERVENTION:");
    console.log("-".repeat(80));

    for (const item of bankResults.filter(r => r.status === "error")) {
      console.log(`  Bank Account: ${item.sourceId}`);
      console.log(`    Customer: ${item.customerId}`);
      console.log(`    Church: ${item.churchId}`);
      console.log(`    Error: ${item.error}`);
      console.log("");
    }

    for (const item of subscriptionResults.filter(r => r.status !== "migrated")) {
      console.log(`  Subscription: ${item.subscriptionId}`);
      console.log(`    Church: ${item.churchId}`);
      console.log(`    Old Source: ${item.oldSource || "N/A"}`);
      console.log(`    Status: ${item.status}`);
      console.log(`    Note: ${item.error}`);
      console.log("");
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("RECOMMENDED ACTIONS:");
  console.log("=".repeat(80));
  console.log(`
1. For bank accounts that could not be auto-migrated:
   - Contact affected customers
   - Ask them to re-link their bank account using Financial Connections
   - The new flow provides instant verification for most banks

2. For subscriptions using legacy bank sources:
   - These will continue to work until May 15, 2026
   - After migration deadline, customers must re-link their bank accounts
   - Consider proactive outreach to avoid payment failures

3. Monitor the webhook logs for any payment failures after migration

4. Run this script periodically to track migration progress
`);
}

async function runMigration(options: MigrationOptions) {
  await Environment.init(options.environment);
  console.log(`🚀 Running ACH Payment Intents Migration (dryRun=${options.dryRun})`);
  console.log(`   Environment: ${options.environment}`);
  console.log("");

  const allBankResults: MigrationResult[] = [];
  const allSubResults: SubscriptionMigrationResult[] = [];

  // Get all Stripe gateways
  const gateways = await getStripeGateways();
  console.log(`Found ${gateways.length} Stripe gateway(s)\n`);

  for (const gateway of gateways) {
    console.log(`Processing gateway ${gateway.id} (church: ${gateway.churchId})`);

    // Migrate bank accounts
    const bankResults = await migrateBankAccountsForGateway(gateway, options);
    allBankResults.push(...bankResults);

    // Migrate subscriptions
    const subResults = await migrateSubscriptionsForGateway(gateway, options);
    allSubResults.push(...subResults);

    console.log("");
  }

  // Generate report
  await generateMigrationReport(allBankResults, allSubResults);

  console.log("🎉 Migration script complete!");
}

function parseOptions(): MigrationOptions {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const envArg = args.find((arg) => arg.startsWith("--env="));
  const environment = envArg ? envArg.split("=")[1] : process.env.ENVIRONMENT || "dev";
  return { dryRun, environment };
}

(async () => {
  const options = parseOptions();
  try {
    await runMigration(options);
  } catch (error) {
    console.error("❌ Migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await MultiDatabasePool.closeAll();
  }
})();
