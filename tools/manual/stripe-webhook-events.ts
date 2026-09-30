// Adds the failed-payment, cancellation and refund events to every church's existing Stripe webhook endpoint (Stripe never adds events on its own).
// Usage: ENVIRONMENT=prod npx tsx tools/manual/stripe-webhook-events.ts [--apply]   (dry run without --apply)
import "reflect-metadata";
import Stripe from "stripe";
import { Environment } from "../../src/shared/helpers/Environment.js";
import { KyselyPool } from "../../src/shared/infrastructure/KyselyPool.js";
import { GatewayService } from "../../src/shared/helpers/GatewayService.js";
import { GatewayRepo } from "../../src/modules/giving/repositories/GatewayRepo.js";

const apply = process.argv.includes("--apply");
await Environment.init(process.env.ENVIRONMENT || "dev");

// Not payment_intent.*: an old endpoint already gets charge.succeeded, and a gift seen as both ch_ and pi_ can be recorded twice.
const wanted = ["invoice.payment_failed", "customer.subscription.deleted", "charge.refunded"];
const counts = { updated: 0, current: 0, noEndpoint: 0, failed: 0 };

for (const gateway of await new GatewayRepo().loadByProvider("stripe")) {
  const { privateKey } = GatewayService.getGatewayConfig(gateway);
  if (!privateKey) { counts.failed++; continue; }
  try {
    const stripe = new Stripe(privateKey);
    let found = false;
    for await (const ep of stripe.webhookEndpoints.list({ limit: 100 })) {
      if (!ep.url.includes(`churchId=${gateway.churchId}`)) continue;
      found = true;
      if (ep.enabled_events.includes("*")) { counts.current++; continue; }
      const missing = wanted.filter((e) => !ep.enabled_events.includes(e));
      if (missing.length === 0) { counts.current++; continue; }
      console.log(`${gateway.churchId} ${ep.id} ${ep.status} missing: ${missing.join(", ")}`);
      if (apply) await stripe.webhookEndpoints.update(ep.id, { enabled_events: [...new Set([...ep.enabled_events, ...wanted])] as any });
      counts.updated++;
    }
    if (!found) counts.noEndpoint++;
  } catch (e: any) {
    counts.failed++;
    console.error(`${gateway.churchId} failed: ${e.message}`);
  }
}

console.log(apply ? "Applied" : "Dry run (pass --apply to write)", counts);
await KyselyPool.destroyAll();
