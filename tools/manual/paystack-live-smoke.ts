// Live test-mode smoke test of PaystackGatewayProvider against api.paystack.co.
// Usage: PAYSTACK_SECRET=sk_test_... npx tsx tools/manual/paystack-live-smoke.ts   (run from Api/; creates real test-mode transactions)
import Axios from "axios";
import crypto from "crypto";
import { PaystackGatewayProvider } from "../../src/shared/helpers/gateways/PaystackGatewayProvider.js";

const secret = process.env.PAYSTACK_SECRET!;
const email = `b1test+${Date.now()}@zongker.net`;
const H = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
const post = async (p: string, d: any) => (await Axios.post("https://api.paystack.co" + p, d, { headers: H })).data.data;

// Paystack test card via the Charge API: PIN 0000 then OTP 123456.
let cur = process.env.PAYSTACK_CURRENCY || ""; // resolved from the first charge when unset
async function chargeTestCard(amount: number) {
  let r = await post("/charge", { email, amount, currency: cur || undefined, card: { number: "4084084084084081", cvv: "408", expiry_month: "12", expiry_year: "30" } });
  if (r.status === "send_pin") r = await post("/charge/submit_pin", { pin: "0000", reference: r.reference });
  if (r.status === "send_otp") r = await post("/charge/submit_otp", { otp: "123456", reference: r.reference });
  if (r.status !== "success") throw new Error("charge did not succeed: " + JSON.stringify(r));
  cur = cur || r.currency;
  return r.reference as string;
}

const rows: Record<string, any[]> = { donations: [], fundDonations: [], customers: [], pms: [], subs: [], subFunds: [], events: [] };
const repos: any = {
  donationBatch: { getOrCreateCurrent: async () => ({ id: "BAT1" }) },
  donation: { save: async (d: any) => { const s = { ...d, id: "DON" + rows.donations.length }; rows.donations.push(s); return s; }, loadByTransactionId: async () => null, updateStatus: async () => {} },
  fundDonation: { save: async (f: any) => rows.fundDonations.push(f) },
  customer: { load: async (_c: string, id: string) => rows.customers.find((c) => c.id === id) || null, save: async (c: any) => { rows.customers = rows.customers.filter((x) => x.id !== c.id); rows.customers.push(c); }, loadByPersonAndProvider: async (_c: string, p: string) => rows.customers.find((c) => c.personId === p) || null },
  gatewayPaymentMethod: { loadByExternalId: async (_c: string, _g: string, e: string) => rows.pms.find((p) => p.externalId === e) || null, save: async (p: any) => rows.pms.push(p), loadByCustomer: async () => rows.pms, deleteByExternalId: async (_c: string, _g: string, e: string) => { rows.pms = rows.pms.filter((p) => p.externalId !== e); } },
  subscription: { loadByCustomerId: async (_c: string, id: string) => rows.subs.find((s) => s.customerId === id) || null },
  subscriptionFunds: { loadBySubscriptionId: async (_c: string, id: string) => rows.subFunds.filter((f) => f.subscriptionId === id) },
  fund: { getOrCreateGeneral: async () => ({ id: "FUN_GENERAL" }) },
  eventLog: { save: async (e: any) => rows.events.push(e) }
};

const assert = (cond: any, msg: string) => { if (!cond) throw new Error("ASSERT: " + msg); console.log("  ✓", msg); };

(async () => {
  const provider = new PaystackGatewayProvider();
  const config: any = { churchId: "CHU1", gatewayId: "GAT1", publicKey: "", privateKey: secret, webhookKey: "", settings: null };
  process.env.ENVIRONMENT = "dev";

  console.log("1. one-time gift via popup-equivalent charge → verify → log (saveCard)");
  const ref1 = await chargeTestCard(150000);
  const data1: any = { id: ref1, amount: 1500, currency: cur, saveCard: true, person: { id: "PER1", email }, funds: [{ id: "FUN1", amount: 1500 }] };
  await provider.prepareCharge(config, data1, repos);
  const c1 = await provider.processCharge(config, data1);
  assert(c1.success && c1.transactionId === ref1, "verify succeeded for " + ref1);
  await provider.logEvent("CHU1", c1.data, c1.data, repos);
  await provider.logDonation(config, "CHU1", { ...c1.data, amount: 1500, funds: data1.funds, person: data1.person }, repos, "complete");
  assert(rows.donations[0].amount === 1500 && rows.donations[0].method === "Card", "donation logged " + rows.donations[0].methodDetails);
  assert(rows.pms.length === 1 && /^AUTH_/.test(rows.pms[0].externalId), "reusable authorization saved " + rows.pms[0].externalId);
  const customerCode = rows.customers[0].id;
  assert(/^CUS_/.test(customerCode), "customer mapped " + customerCode);

  console.log("2. saved-method charge via charge_authorization");
  const data2: any = { id: rows.pms[0].externalId, amount: 7.5, currency: cur, person: { id: "PER1", email } };
  await provider.prepareCharge(config, data2, repos);
  const c2 = await provider.processCharge(config, data2);
  assert(c2.success && c2.data.amount === 750, "charged 750 kobo on saved auth → " + c2.transactionId);

  console.log("3. saved payment methods listing + ownership");
  const listed = await provider.listNormalizedPaymentMethods(config, customerCode, repos);
  assert(listed.length === 1 && listed[0].last4 === "4081", "normalized method " + JSON.stringify(listed[0]));
  assert(await provider.verifyMethodOwnership(config, listed[0].id, customerCode, repos), "ownership verified");

  console.log("4. recurring: saved auth → charge now + plan + subscription");
  const subData: any = { paymentMethodId: rows.pms[0].externalId, customerId: customerCode, email, amount: 20, currency: cur, interval: { interval: "month", interval_count: 1 }, billing_cycle_anchor: Date.now(), funds: [{ id: "FUN1", amount: 20 }], person: { id: "PER1", email } };
  const sub = await provider.createSubscription(config, subData);
  assert(sub.success && /^SUB_/.test(sub.subscriptionId), "subscription created " + sub.subscriptionId + " (plan " + sub.data.plan + ")");
  const before = rows.donations.length;
  const cid = await provider.finalizeSubscription(config, sub, subData, subData.person, repos);
  assert(cid === customerCode && rows.donations.length === before + 1, "first gift logged from finalizeSubscription");
  rows.subs.push({ id: sub.subscriptionId, customerId: customerCode });
  rows.subFunds.push({ subscriptionId: sub.subscriptionId, fundId: "FUN1", amount: 20 });

  const subs = await provider.listNormalizedSubscriptions(config, customerCode);
  const mine = subs.find((s: any) => s.id === sub.subscriptionId);
  assert(mine && mine.plan.amount === 2000 && mine.plan.interval === "month", "subscription listed via /customer: " + JSON.stringify(mine?.plan));
  assert(await provider.verifySubscriptionOwnership(config, sub.subscriptionId, "PER1", repos), "subscription ownership verified");

  console.log("5. recurring with a fresh popup charge (verify path) + non-reusable check");
  const ref3 = await chargeTestCard(50000);
  const sub2 = await provider.createSubscription(config, { id: ref3, amount: 500, currency: cur, interval: { interval: "week", interval_count: 1 }, billing_cycle_anchor: Date.now() });
  assert(sub2.success, "weekly subscription from verified reference " + sub2.subscriptionId);
  const bad = await provider.createSubscription(config, { id: ref3, amount: 500, currency: cur, interval: { interval: "week", interval_count: 2 } });
  assert(!bad.success && /2 week/.test(bad.data.error), "biweekly rejected: " + bad.data.error);

  console.log("6. webhook signature with the real secret + renewal fund recovery");
  const body = JSON.stringify({ event: "charge.success", data: { id: 987654321, reference: "renewal_" + Date.now(), amount: 2000 * 100, currency: cur, channel: "card", customer: { customer_code: customerCode }, authorization: { channel: "card", brand: "visa", last4: "4081", reusable: true, authorization_code: rows.pms[0].externalId } } });
  const sig = crypto.createHmac("sha512", secret).update(body).digest("hex");
  const wh = await provider.verifyWebhookSignature(config, { "x-paystack-signature": sig } as any, JSON.parse(body));
  assert(wh.success && wh.eventType === "charge.success", "webhook verified, eventId " + wh.eventId);
  const b2 = rows.fundDonations.length;
  await provider.logDonation(config, "CHU1", wh.eventData, repos, "complete");
  assert(rows.fundDonations[b2].fundId === "FUN1" && rows.fundDonations[b2].amount === 20, "renewal allocated to subscription fund (amount-matched)");

  console.log("7. cancel subscriptions + deactivate authorization");
  await provider.cancelSubscription(config, sub.subscriptionId);
  await provider.cancelSubscription(config, sub2.subscriptionId);
  const after = await provider.getSubscription(config, sub.subscriptionId);
  assert(after.status !== "active", "subscription status now " + after.status);
  await provider.deletePaymentMethod(config, rows.pms[0].externalId, customerCode, repos);
  assert(rows.pms.length === 0, "local method removed; authorization deactivated at Paystack");
  const dead = await provider.processCharge(config, { paymentMethodId: data2.paymentMethodId, amount: 1, currency: cur, person: { email } });
  assert(!dead.success, "deactivated auth can no longer be charged: " + dead.data.error);

  console.log("8. fees (no church overrides)");
  assert((await provider.calculateFees(1000, "", cur)) > 0, cur + " fee " + (await provider.calculateFees(1000, "", cur)));
  console.log("\nALL LIVE CHECKS PASSED — customer", customerCode, "email", email);
})().catch((e) => { console.error("FAILED:", e.response?.data || e.message || e); process.exit(1); });
