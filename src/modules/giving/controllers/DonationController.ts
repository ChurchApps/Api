import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Donation } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { GatewayService } from "../../../shared/helpers/GatewayService.js";
import { ExchangeRateHelper } from "../../../shared/helpers/ExchangeRateHelper.js";

@controller("/giving/donations")
export class DonationController extends GivingBaseController {
  @httpGet("/kpis")
  public async getKpis(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json({}, 401);
      else {
        const startDate = req.query.startDate ? new Date(req.query.startDate.toString()) : new Date(2000, 1, 1);
        const endDate = req.query.endDate ? new Date(req.query.endDate.toString()) : new Date();
        const fundId = req.query.fundId?.toString() || "";
        const result = await this.repos.donation.loadDashboardKpis(au.churchId, startDate, endDate, fundId || undefined);
        const { currency, rates } = await this.loadChurchRates(au.churchId);
        const giving = ExchangeRateHelper.convertTotals(result.amountsByCurrency.map((r) => ({ currency: r.currency, amount: r.totalGiving })), currency, rates);
        const gifts = ExchangeRateHelper.convertTotals(result.amountsByCurrency.map((r) => ({ currency: r.currency, amount: r.giftSum })), currency, rates);
        const giftRows = result.amountsByCurrency.reduce((sum, r) => sum + Number(r.giftRows || 0), 0);
        return {
          totalGiving: giving.totalAmount,
          avgGift: giftRows > 0 ? gifts.totalAmount / giftRows : 0,
          donorCount: result.donorCount,
          donationCount: result.donationCount,
          currency,
          isConverted: giving.isConverted,
          amountsByCurrency: giving.amountsByCurrency
        };
      }
    });
  }

  // Read-only: lets a client that already shows gifts in their own currency (B1App DonatePage) total them
  // in the church currency with the same server-owned rates. Rates are never accepted from a client.
  @httpGet("/exchange-rates")
  public async getExchangeRates(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { currency, rates, asOf } = await this.loadChurchRates(au.churchId);
      return { base: currency, rates, asOf };
    });
  }

  @httpGet("/summary")
  public async getSummary(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json({}, 401);
      else {
        const startDate = req.query.startDate ? new Date(req.query.startDate.toString()) : new Date(2000, 1, 1);
        const endDate = req.query.endDate ? new Date(req.query.endDate.toString()) : new Date();
        const type = req.query.type?.toString() || "";
        if (type === "person") {
          const result = (await this.repos.donation.loadPersonBasedSummary(au.churchId, startDate, endDate)) as any[];
          const { currency, rates } = await this.loadChurchRates(au.churchId);
          const converted = result.map((r) => ({
            ...r,
            donationAmount: ExchangeRateHelper.convert(r.donationAmount, r.currency, currency, rates),
            fundAmount: ExchangeRateHelper.convert(r.fundAmount, r.currency, currency, rates)
          }));
          return this.repos.donation.convertAllToPersonSummary(au.churchId, converted);
        }
        const result = (await this.repos.donation.loadSummary(au.churchId, startDate, endDate)) as any[];
        const { currency, rates } = await this.loadChurchRates(au.churchId);
        return this.repos.donation.convertAllToSummary(au.churchId, this.mergeSummaryCurrencies(result, currency, rates));
      }
    });
  }

  // loadSummary returns one row per week + fund + currency; fold the currencies back into one converted row.
  private mergeSummaryCurrencies(rows: any[], currency: string, rates: Record<string, number>) {
    const merged = new Map<string, any>();
    rows.forEach((r) => {
      const key = new Date(r.week).getTime() + "|" + r.fundName;
      const amount = ExchangeRateHelper.convert(r.totalAmount, r.currency, currency, rates);
      const existing = merged.get(key);
      if (existing) existing.totalAmount = Number((existing.totalAmount + amount).toFixed(2));
      else merged.set(key, { week: r.week, fundName: r.fundName, totalAmount: amount });
    });
    return Array.from(merged.values());
  }

  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const result = await this.repos.donation.loadByPersonId(au.churchId, au.personId);
      return this.repos.donation.convertAllToModel(au.churchId, result as any[]);
    });
  }

  @httpGet("/failed")
  public async getFailed(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.view)) return this.json({}, 401);
      const rows = (await this.repos.donation.loadFailed(au.churchId)) as any[];
      const gateways = (await this.repos.gateway.loadAll(au.churchId)) as any[];
      const canRetry = gateways.some((g) => GatewayService.supportsRetry(g));
      return rows.map((row) => ({ ...this.repos.donation.convertToModel(au.churchId, row), gatewayMessage: row.gatewayMessage, canRetry }));
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.view)) return this.json({}, 401);
      else {
        const data = await this.repos.donation.load(au.churchId, id);
        const result = this.repos.donation.convertToModel(au.churchId, data);
        return result;
      }
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const personId = req.query?.personId?.toString() || "";
      if (!au.checkAccess(Permissions.donations.view) && personId !== au.personId) return this.json({}, 401);
      else {
        let result;
        if (req.query.batchId !== undefined) result = await this.repos.donation.loadByBatchId(au.churchId, req.query.batchId.toString());
        else if (personId) result = await this.repos.donation.loadByPersonId(au.churchId, personId);
        else result = await this.repos.donation.loadAll(au.churchId);
        return this.repos.donation.convertAllToModel(au.churchId, result as any[] as any[]);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Donation[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Donation>[] = [];
        req.body.forEach((donation) => {
          donation.churchId = au.churchId;
          promises.push(this.repos.donation.save(donation));
        });
        const result = await Promise.all(promises);
        return this.repos.donation.convertAllToModel(au.churchId, result as any[] as any[]);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      else {
        await this.repos.donation.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
