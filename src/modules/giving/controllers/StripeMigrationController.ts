/**
 * TEMPORARY CONTROLLER - Stripe ACH Migration
 *
 * This controller provides API routes for migrating existing Stripe bank account
 * Sources (ba_xxx) to PaymentMethods (pm_xxx) as required by Stripe's deprecation
 * of the Charges API for ACH Direct Debits (deadline: May 15, 2026).
 *
 * DELETE THIS CONTROLLER after migration is complete.
 */

import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import Stripe from "stripe";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { EncryptionHelper } from "@churchapps/apihelper";

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

interface GatewayData {
  id: string;
  churchId: string;
  provider: string;
  privateKey: string;
}

@controller("/giving/stripe-migration")
export class StripeMigrationController extends GivingBaseController {

  /**
   * GET /giving/stripe-migration/status
   * Returns a summary of all Stripe gateways and customers that need migration
   */
  @httpGet("/status")
  public async getMigrationStatus(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) {
        return this.json({ error: "Server admin access required" }, 401);
      }

      const gateways = await this.getStripeGateways();
      const results: any[] = [];

      for (const gateway of gateways) {
        try {
          const secretKey = EncryptionHelper.decrypt(gateway.privateKey);
          const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" as any });

          const customers = await this.repos.customer.loadAll(gateway.churchId);
          let bankAccountCount = 0;
          let subscriptionsUsingBankSource = 0;

          for (const customer of customers) {
            try {
              const sources = await stripe.customers.listSources(customer.id, {
                object: "bank_account",
                limit: 100
              });
              bankAccountCount += sources.data.length;
            } catch (e) {
              // Customer may not exist in Stripe
            }
          }

          // Check subscriptions
          const subscriptions = await this.repos.subscription.loadAll(gateway.churchId);
          for (const sub of subscriptions) {
            try {
              const stripeSub = await stripe.subscriptions.retrieve(sub.id);
              if (stripeSub.default_source && typeof stripeSub.default_source === "string" && stripeSub.default_source.startsWith("ba_")) {
                subscriptionsUsingBankSource++;
              }
            } catch (e) {
              // Subscription may not exist in Stripe
            }
          }

          results.push({
            gatewayId: gateway.id,
            churchId: gateway.churchId,
            customerCount: customers.length,
            bankAccountsToMigrate: bankAccountCount,
            subscriptionsUsingBankSource,
            status: bankAccountCount > 0 || subscriptionsUsingBankSource > 0 ? "needs_migration" : "ok"
          });
        } catch (error: any) {
          results.push({
            gatewayId: gateway.id,
            churchId: gateway.churchId,
            error: error.message
          });
        }
      }

      return {
        totalGateways: gateways.length,
        gateways: results,
        deadline: "May 15, 2026"
      };
    });
  }

  /**
   * GET /giving/stripe-migration/preview/:churchId
   * Preview what would be migrated for a specific church (dry run)
   */
  @httpGet("/preview/:churchId")
  public async previewMigration(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) {
        return this.json({ error: "Server admin access required" }, 401);
      }

      const gateway = await this.getStripeGatewayForChurch(churchId);
      if (!gateway) {
        return this.json({ error: "No Stripe gateway found for this church" }, 404);
      }

      const bankResults = await this.migrateBankAccountsForGateway(gateway, true);
      const subscriptionResults = await this.migrateSubscriptionsForGateway(gateway, true);

      return {
        churchId,
        dryRun: true,
        bankAccounts: bankResults,
        subscriptions: subscriptionResults,
        summary: {
          bankAccountsToMigrate: bankResults.length,
          subscriptionsToMigrate: subscriptionResults.filter(r => r.status === "skipped").length
        }
      };
    });
  }

  /**
   * POST /giving/stripe-migration/execute/:churchId
   * Execute migration for a specific church
   */
  @httpPost("/execute/:churchId")
  public async executeMigration(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) {
        return this.json({ error: "Server admin access required" }, 401);
      }

      const gateway = await this.getStripeGatewayForChurch(churchId);
      if (!gateway) {
        return this.json({ error: "No Stripe gateway found for this church" }, 404);
      }

      const bankResults = await this.migrateBankAccountsForGateway(gateway, false);
      const subscriptionResults = await this.migrateSubscriptionsForGateway(gateway, false);

      const bankMigrated = bankResults.filter(r => r.status === "migrated").length;
      const bankErrors = bankResults.filter(r => r.status === "error").length;
      const subMigrated = subscriptionResults.filter(r => r.status === "migrated").length;
      const subErrors = subscriptionResults.filter(r => r.status === "error").length;

      return {
        churchId,
        dryRun: false,
        bankAccounts: bankResults,
        subscriptions: subscriptionResults,
        summary: {
          bankAccountsMigrated: bankMigrated,
          bankAccountErrors: bankErrors,
          subscriptionsMigrated: subMigrated,
          subscriptionErrors: subErrors
        }
      };
    });
  }

  /**
   * POST /giving/stripe-migration/execute-all
   * Execute migration for all churches (use with caution!)
   */
  @httpPost("/execute-all")
  public async executeAllMigrations(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) {
        return this.json({ error: "Server admin access required" }, 401);
      }

      const dryRun = req.query.dryRun === "true";
      const gateways = await this.getStripeGateways();
      const allResults: any[] = [];

      for (const gateway of gateways) {
        try {
          const bankResults = await this.migrateBankAccountsForGateway(gateway, dryRun);
          const subscriptionResults = await this.migrateSubscriptionsForGateway(gateway, dryRun);

          allResults.push({
            churchId: gateway.churchId,
            gatewayId: gateway.id,
            bankAccounts: bankResults,
            subscriptions: subscriptionResults,
            summary: {
              bankAccountsMigrated: bankResults.filter(r => r.status === "migrated").length,
              bankAccountErrors: bankResults.filter(r => r.status === "error").length,
              subscriptionsMigrated: subscriptionResults.filter(r => r.status === "migrated").length,
              subscriptionErrors: subscriptionResults.filter(r => r.status === "error").length
            }
          });
        } catch (error: any) {
          allResults.push({
            churchId: gateway.churchId,
            gatewayId: gateway.id,
            error: error.message
          });
        }
      }

      const totalBankMigrated = allResults.reduce((sum, r) => sum + (r.summary?.bankAccountsMigrated || 0), 0);
      const totalBankErrors = allResults.reduce((sum, r) => sum + (r.summary?.bankAccountErrors || 0), 0);
      const totalSubMigrated = allResults.reduce((sum, r) => sum + (r.summary?.subscriptionsMigrated || 0), 0);
      const totalSubErrors = allResults.reduce((sum, r) => sum + (r.summary?.subscriptionErrors || 0), 0);

      return {
        dryRun,
        churchesProcessed: gateways.length,
        results: allResults,
        totalSummary: {
          bankAccountsMigrated: totalBankMigrated,
          bankAccountErrors: totalBankErrors,
          subscriptionsMigrated: totalSubMigrated,
          subscriptionErrors: totalSubErrors
        }
      };
    });
  }

  // ============ Private helper methods ============

  private async getStripeGateways(): Promise<GatewayData[]> {
    // Get all gateways and filter for Stripe
    const allGateways = await this.repos.gateway.loadByProvider("stripe");
    return allGateways as GatewayData[];
  }

  private async getStripeGatewayForChurch(churchId: string): Promise<GatewayData | null> {
    const gateways = await this.repos.gateway.loadAll(churchId);
    const stripeGateway = (gateways as any[]).find(
      (g) => g.provider?.toLowerCase() === "stripe"
    );
    return stripeGateway || null;
  }

  private async migrateBankAccountsForGateway(gateway: GatewayData, dryRun: boolean): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];

    const secretKey = EncryptionHelper.decrypt(gateway.privateKey);
    const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" as any });

    const customers = await this.repos.customer.loadAll(gateway.churchId);

    for (const customer of customers) {
      try {
        const sources = await stripe.customers.listSources(customer.id, {
          object: "bank_account",
          limit: 100
        });

        if (sources.data.length === 0) {
          continue;
        }

        for (const source of sources.data) {
          const bankSource = source as Stripe.BankAccount;

          if (dryRun) {
            results.push({
              customerId: customer.id,
              churchId: gateway.churchId,
              sourceId: bankSource.id,
              status: "skipped",
              error: `Dry run - would migrate bank ****${bankSource.last4}`
            });
            continue;
          }

          try {
            // Note: Direct migration of bank accounts requires Stripe's internal migration
            // or customer re-authentication via Financial Connections.
            // This logs what needs attention.
            results.push({
              customerId: customer.id,
              churchId: gateway.churchId,
              sourceId: bankSource.id,
              status: "error",
              error: `Bank account ****${bankSource.last4} requires customer to re-link via Financial Connections`
            });
          } catch (error: any) {
            results.push({
              customerId: customer.id,
              churchId: gateway.churchId,
              sourceId: bankSource.id,
              status: "error",
              error: error.message
            });
          }
        }
      } catch (error: any) {
        // Customer may not exist in Stripe or other API error
        if (!error.message?.includes("No such customer")) {
          results.push({
            customerId: customer.id,
            churchId: gateway.churchId,
            sourceId: "unknown",
            status: "error",
            error: error.message
          });
        }
      }
    }

    return results;
  }

  private async migrateSubscriptionsForGateway(gateway: GatewayData, dryRun: boolean): Promise<SubscriptionMigrationResult[]> {
    const results: SubscriptionMigrationResult[] = [];

    const secretKey = EncryptionHelper.decrypt(gateway.privateKey);
    const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" as any });

    const subscriptions = await this.repos.subscription.loadAll(gateway.churchId);

    for (const sub of subscriptions) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.id);

        if (!stripeSub.default_source || typeof stripeSub.default_source !== "string") {
          continue;
        }

        if (!stripeSub.default_source.startsWith("ba_")) {
          continue;
        }

        if (dryRun) {
          results.push({
            subscriptionId: sub.id,
            churchId: gateway.churchId,
            oldSource: stripeSub.default_source,
            status: "skipped",
            error: "Dry run - subscription uses legacy bank source"
          });
          continue;
        }

        // Log subscription needing attention
        results.push({
          subscriptionId: sub.id,
          churchId: gateway.churchId,
          oldSource: stripeSub.default_source,
          status: "skipped",
          error: "Subscription requires customer to re-link bank account via Financial Connections"
        });
      } catch (error: any) {
        if (!error.message?.includes("No such subscription")) {
          results.push({
            subscriptionId: sub.id,
            churchId: gateway.churchId,
            status: "error",
            error: error.message
          });
        }
      }
    }

    return results;
  }
}
