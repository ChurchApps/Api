import { initTestDb, teardownTestDb } from "../db-helper";
import { CustomerRepo } from "../../modules/giving/repositories/CustomerRepo";
import { DonationBatchRepo } from "../../modules/giving/repositories/DonationBatchRepo";
import { DonationRepo } from "../../modules/giving/repositories/DonationRepo";
import { EventLogRepo } from "../../modules/giving/repositories/EventLogRepo";
import { FundRepo } from "../../modules/giving/repositories/FundRepo";
import { FundDonationRepo } from "../../modules/giving/repositories/FundDonationRepo";
import { GatewayPaymentMethodRepo } from "../../modules/giving/repositories/GatewayPaymentMethodRepo";
import { GatewayRepo } from "../../modules/giving/repositories/GatewayRepo";
import { SubscriptionRepo } from "../../modules/giving/repositories/SubscriptionRepo";
import { SubscriptionFundsRepo } from "../../modules/giving/repositories/SubscriptionFundsRepo";
import { getDrizzleDb } from "../../db/drizzle";
import { sql } from "drizzle-orm";

// Shared test churchId — must fit in char(11), unique per run
const churchId = `g${Date.now().toString(36).slice(-10)}`;

beforeAll(async () => {
  await initTestDb();
});

afterAll(async () => {
  const db = getDrizzleDb("giving");
  await db.execute(sql`DELETE FROM subscriptionFunds WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM subscriptions WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM fundDonations WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM donations WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM donationBatches WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM eventLogs WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM gatewayPaymentMethods WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM gateways WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM funds WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM customers WHERE churchId = ${churchId}`);
  await teardownTestDb();
});

describe("FundRepo", () => {
  const repo = new FundRepo();
  let fundId: string;

  it("should create a fund", async () => {
    const fund = await repo.save({ churchId, name: "General Fund" } as any);
    expect(fund.id).toBeDefined();
    expect(fund.id.length).toBe(11);
    fundId = fund.id;
  });

  it("should load a fund by id", async () => {
    const fund = await repo.load(churchId, fundId);
    expect(fund).not.toBeNull();
    expect(fund.name).toBe("General Fund");
  });

  it("should update a fund", async () => {
    await repo.save({ id: fundId, churchId, name: "Updated Fund" } as any);
    const fund = await repo.load(churchId, fundId);
    expect(fund.name).toBe("Updated Fund");
  });

  it("should loadAll (excludes removed)", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("should getOrCreateGeneral", async () => {
    const general = await repo.getOrCreateGeneral(churchId);
    expect(general).not.toBeNull();
    expect(general.name).toBe("(General Fund)");
    // Calling again returns same fund
    const again = await repo.getOrCreateGeneral(churchId);
    expect(again.id).toBe(general.id);
  });

  it("should delete a fund", async () => {
    const temp = await repo.save({ churchId, name: "Temp Fund" } as any);
    await repo.delete(churchId, temp.id!);
    const deleted = await repo.load(churchId, temp.id!);
    expect(deleted).toBeNull();
  });
});

describe("CustomerRepo", () => {
  const repo = new CustomerRepo();
  const customerId = "cus_test001";
  const personId = "prs00000001";

  it("should create a customer", async () => {
    const customer = await repo.save({ id: customerId, churchId, personId, provider: "stripe" } as any);
    expect(customer.id).toBe(customerId);
  });

  it("should load a customer", async () => {
    const customer = await repo.load(churchId, customerId);
    expect(customer).not.toBeNull();
    expect(customer.personId).toBe(personId);
  });

  it("should loadByPersonId", async () => {
    const customer = await repo.loadByPersonId(churchId, personId);
    expect(customer).not.toBeNull();
    expect(customer.id).toBe(customerId);
  });

  it("should loadByPersonAndProvider", async () => {
    const customer = await repo.loadByPersonAndProvider(churchId, personId, "stripe");
    expect(customer).not.toBeNull();
    expect(customer.id).toBe(customerId);
  });

  it("should update via save (same personId)", async () => {
    await repo.save({ id: customerId, churchId, personId, provider: "stripe", metadata: { key: "val" } } as any);
    const customer = await repo.load(churchId, customerId);
    expect(customer).not.toBeNull();
  });

  it("should loadAll", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete a customer", async () => {
    const tempId = "cus_temp001";
    await repo.save({ id: tempId, churchId, personId: "prstemp0001", provider: "stripe" } as any);
    await repo.delete(churchId, tempId);
    const deleted = await repo.load(churchId, tempId);
    expect(deleted).toBeNull();
  });
});

describe("DonationBatchRepo", () => {
  const repo = new DonationBatchRepo();
  let batchId: string;

  it("should create a batch", async () => {
    const batch = await repo.save({ churchId, name: "Sunday Batch", batchDate: new Date("2025-06-15") } as any);
    expect(batch.id).toBeDefined();
    batchId = batch.id!;
  });

  it("should load a batch", async () => {
    const batch = await repo.load(churchId, batchId);
    expect(batch).not.toBeNull();
    expect(batch.name).toBe("Sunday Batch");
  });

  it("should update a batch", async () => {
    await repo.save({ id: batchId, churchId, name: "Updated Batch", batchDate: new Date("2025-06-16") } as any);
    const batch = await repo.load(churchId, batchId);
    expect(batch.name).toBe("Updated Batch");
  });

  it("should loadAll with aggregate counts", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
    // loadAll includes donationCount and totalAmount from JOIN
    expect(all[0]).toHaveProperty("donationCount");
    expect(all[0]).toHaveProperty("totalAmount");
  });

  it("should getOrCreateCurrent", async () => {
    const current = await repo.getOrCreateCurrent(churchId);
    expect(current).not.toBeNull();
    expect(current.id).toBeDefined();
  });

  it("should delete a batch", async () => {
    const temp = await repo.save({ churchId, name: "Temp Batch", batchDate: new Date() } as any);
    await repo.delete(churchId, temp.id!);
    const deleted = await repo.load(churchId, temp.id!);
    expect(deleted).toBeNull();
  });
});

describe("DonationRepo", () => {
  const batchRepo = new DonationBatchRepo();
  const repo = new DonationRepo();
  let batchId: string;
  let donationId: string;
  const personId = "donprs00001";

  beforeAll(async () => {
    const batch = await batchRepo.save({ churchId, name: "Donation Test Batch", batchDate: new Date("2025-06-15") } as any);
    batchId = batch.id!;
  });

  it("should create a donation", async () => {
    const donation = await repo.save({ churchId, batchId, personId, donationDate: new Date("2025-06-15"), amount: 100.50, method: "check" } as any);
    expect(donation.id).toBeDefined();
    expect(donation.entryTime).toBeInstanceOf(Date);
    expect(donation.status).toBe("complete");
    donationId = donation.id!;
  });

  it("should load a donation", async () => {
    const donation = await repo.load(churchId, donationId);
    expect(donation).not.toBeNull();
    expect(donation.amount).toBe(100.50);
  });

  it("should update a donation", async () => {
    await repo.save({ id: donationId, churchId, batchId, personId, donationDate: new Date("2025-06-15"), amount: 200, method: "card" } as any);
    const donation = await repo.load(churchId, donationId);
    expect(donation.amount).toBe(200);
    expect(donation.method).toBe("card");
  });

  it("should loadByBatchId", async () => {
    const results = await repo.loadByBatchId(churchId, batchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadAll", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete a donation", async () => {
    const temp = await repo.save({ churchId, batchId, personId: "deltmp00001", donationDate: new Date("2025-06-15"), amount: 50 } as any);
    await repo.delete(churchId, temp.id!);
    const deleted = await repo.load(churchId, temp.id!);
    expect(deleted).toBeNull();
  });

  it("should deleteByBatchId", async () => {
    const tempBatch = await batchRepo.save({ churchId, name: "Del Batch", batchDate: new Date() } as any);
    await repo.save({ churchId, batchId: tempBatch.id, personId: "delbat00001", donationDate: new Date(), amount: 25 } as any);
    await repo.deleteByBatchId(churchId, tempBatch.id!);
    const remaining = await repo.loadByBatchId(churchId, tempBatch.id!);
    expect(remaining.length).toBe(0);
  });
});

describe("FundDonationRepo", () => {
  const batchRepo = new DonationBatchRepo();
  const donationRepo = new DonationRepo();
  const fundRepo = new FundRepo();
  const repo = new FundDonationRepo();
  let donationId: string;
  let fundId: string;
  let fdId: string;

  beforeAll(async () => {
    const batch = await batchRepo.save({ churchId, name: "FD Test Batch", batchDate: new Date("2025-06-15") } as any);
    const donation = await donationRepo.save({ churchId, batchId: batch.id, personId: "fdprs000001", donationDate: new Date("2025-06-15"), amount: 100 } as any);
    donationId = donation.id!;
    const fund = await fundRepo.save({ churchId, name: "FD Test Fund", taxDeductible: true } as any);
    fundId = fund.id!;
  });

  it("should create a fund donation", async () => {
    const fd = await repo.save({ churchId, donationId, fundId, amount: 100 } as any);
    expect(fd.id).toBeDefined();
    fdId = fd.id;
  });

  it("should load by id", async () => {
    const fd = await repo.load(churchId, fdId);
    expect(fd).not.toBeNull();
    expect(fd.fundId).toBe(fundId);
  });

  it("should loadByDonationId", async () => {
    const results = await repo.loadByDonationId(churchId, donationId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadByFundId", async () => {
    const results = await repo.loadByFundId(churchId, fundId);
    expect((results as any[]).length).toBeGreaterThanOrEqual(1);
  });
});

describe("EventLogRepo", () => {
  const repo = new EventLogRepo();
  let logId: string;

  it("should create an event log", async () => {
    const log = await repo.save({ churchId, customerId: "cus_test001", provider: "stripe", providerId: "evt_001", eventType: "charge.succeeded", message: "test", status: "complete", created: new Date() } as any);
    expect(log.id).toBeDefined();
    logId = log.id!;
  });

  it("should load by id", async () => {
    const log = await repo.load(churchId, logId);
    expect(log).not.toBeNull();
    expect(log.eventType).toBe("charge.succeeded");
  });

  it("should loadByProviderId", async () => {
    const log = await repo.loadByProviderId(churchId, "evt_001");
    expect(log).not.toBeNull();
    expect(log!.id).toBe(logId);
  });

  it("should upsert on save with existing providerId", async () => {
    const log = await repo.save({ churchId, providerId: "evt_001", resolved: true } as any);
    expect(log.id).toBe(logId);
  });

  it("should loadAll", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete", async () => {
    const temp = await repo.save({ churchId, provider: "stripe", providerId: "evt_del_001", eventType: "test", status: "test", created: new Date() } as any);
    await repo.delete(churchId, temp.id!);
    const deleted = await repo.load(churchId, temp.id!);
    expect(deleted).toBeNull();
  });
});

describe("GatewayRepo", () => {
  const repo = new GatewayRepo();
  let gatewayId: string;

  it("should create a gateway", async () => {
    const gw = await repo.save({ churchId, provider: "stripe", publicKey: "pk_test", privateKey: "sk_test" } as any);
    expect(gw.id).toBeDefined();
    gatewayId = gw.id!;
  });

  it("should load a gateway", async () => {
    const gw = await repo.load(churchId, gatewayId);
    expect(gw).not.toBeNull();
    expect(gw.provider).toBe("stripe");
  });

  it("should update a gateway", async () => {
    await repo.save({ id: gatewayId, churchId, provider: "stripe", publicKey: "pk_updated" } as any);
    const gw = await repo.load(churchId, gatewayId);
    expect(gw.publicKey).toBe("pk_updated");
  });

  it("should enforce single record per church on create", async () => {
    const gw2 = await repo.save({ churchId, provider: "stripe", publicKey: "pk_new" } as any);
    // Old gateway should be deleted
    const old = await repo.load(churchId, gatewayId);
    expect(old).toBeNull();
    gatewayId = gw2.id!;
  });

  it("should loadAll", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBe(1);
  });

  it("should loadByProvider", async () => {
    const results = await repo.loadByProvider("stripe");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should convertToModel strip secrets", async () => {
    const gw = await repo.load(churchId, gatewayId);
    const safe = repo.convertToModel(churchId, gw);
    expect(safe).not.toHaveProperty("privateKey");
    expect(safe).not.toHaveProperty("webhookKey");
  });
});

describe("GatewayPaymentMethodRepo", () => {
  const gwRepo = new GatewayRepo();
  const repo = new GatewayPaymentMethodRepo();
  let gatewayId: string;
  let gpmId: string;
  const customerId = "cus_test001";

  beforeAll(async () => {
    // Need a fresh gateway for this test
    const gw = await gwRepo.save({ churchId, provider: "stripe", publicKey: "pk_gpm" } as any);
    gatewayId = gw.id!;
  });

  it("should create a payment method", async () => {
    const gpm = await repo.save({ churchId, gatewayId, customerId, externalId: "pm_001", methodType: "card", displayName: "Visa *4242" } as any);
    expect(gpm.id).toBeDefined();
    gpmId = gpm.id;
  });

  it("should load by id", async () => {
    const gpm = await repo.load(churchId, gpmId);
    expect(gpm).not.toBeNull();
    expect(gpm.externalId).toBe("pm_001");
  });

  it("should loadByExternalId", async () => {
    const gpm = await repo.loadByExternalId(churchId, gatewayId, "pm_001");
    expect(gpm).not.toBeNull();
    expect(gpm!.id).toBe(gpmId);
  });

  it("should loadByCustomer", async () => {
    const results = await repo.loadByCustomer(churchId, gatewayId, customerId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should update a payment method", async () => {
    await repo.save({ id: gpmId, churchId, gatewayId, customerId, externalId: "pm_001", displayName: "Visa *1234" } as any);
    const gpm = await repo.load(churchId, gpmId);
    expect(gpm.displayName).toBe("Visa *1234");
  });

  it("should deleteByExternalId", async () => {
    await repo.save({ churchId, gatewayId, customerId, externalId: "pm_del", methodType: "card", displayName: "Delete Me" } as any);
    await repo.deleteByExternalId(churchId, gatewayId, "pm_del");
    const deleted = await repo.loadByExternalId(churchId, gatewayId, "pm_del");
    expect(deleted).toBeNull();
  });
});

describe("SubscriptionRepo", () => {
  const repo = new SubscriptionRepo();
  const subId = "sub_test00001";
  const customerId = "cus_test001";

  it("should create a subscription", async () => {
    const sub = await repo.save({ id: subId, churchId, personId: "subprs00001", customerId } as any);
    expect(sub.id).toBe(subId);
  });

  it("should load a subscription", async () => {
    const sub = await repo.load(churchId, subId);
    expect(sub).not.toBeNull();
    expect(sub.customerId).toBe(customerId);
  });

  it("should loadByCustomerId", async () => {
    const sub = await repo.loadByCustomerId(churchId, customerId);
    expect(sub).not.toBeNull();
    expect(sub.id).toBe(subId);
  });

  it("should loadAll", async () => {
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete a subscription", async () => {
    const tempId = "sub_del00001";
    await repo.save({ id: tempId, churchId, personId: "subdel00001", customerId: "cus_del001" } as any);
    await repo.delete(churchId, tempId);
    const deleted = await repo.load(churchId, tempId);
    expect(deleted).toBeNull();
  });
});

describe("SubscriptionFundsRepo", () => {
  const fundRepo = new FundRepo();
  const subRepo = new SubscriptionRepo();
  const repo = new SubscriptionFundsRepo();
  let fundId: string;
  const subId = "sub_sf000001";
  let sfId: string;

  beforeAll(async () => {
    const fund = await fundRepo.save({ churchId, name: "SF Test Fund" } as any);
    fundId = fund.id!;
    await subRepo.save({ id: subId, churchId, personId: "sfprs000001", customerId: "cus_sf001" } as any);
  });

  it("should create a subscription fund", async () => {
    const sf = await repo.save({ churchId, subscriptionId: subId, fundId, amount: 50 } as any);
    expect(sf.id).toBeDefined();
    sfId = sf.id;
  });

  it("should load by id", async () => {
    const sf = await repo.load(churchId, sfId);
    expect(sf).not.toBeNull();
    expect(sf.fundId).toBe(fundId);
  });

  it("should loadBySubscriptionId", async () => {
    const results = await repo.loadBySubscriptionId(churchId, subId);
    expect((results as any[]).length).toBeGreaterThanOrEqual(1);
  });

  it("should deleteBySubscriptionId", async () => {
    await repo.deleteBySubscriptionId(churchId, subId);
    const results = await repo.loadBySubscriptionId(churchId, subId);
    expect((results as any[]).length).toBe(0);
  });
});
