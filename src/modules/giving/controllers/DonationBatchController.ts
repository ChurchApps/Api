import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { DonationBatch } from "../models/index.js";
import { ExchangeRateHelper } from "../../../shared/helpers/ExchangeRateHelper.js";
import { BatchAccessHelper } from "../helpers/BatchAccessHelper.js";

@controller("/giving/donationbatches")
export class DonationBatchController extends GivingBaseController {

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.canSeeBatches(au)) return this.json({}, 401);
      const data = await this.repos.donationBatch.load(au.churchId, id);
      if (!data) return this.json({}, 404);
      const amounts = await this.repos.donationBatch.loadAmountsByCurrency(au.churchId, id);
      const { currency, rates } = await this.loadChurchRates(au.churchId);
      return this.withConvertedTotal(this.repos.donationBatch.convertToModel(au.churchId, data), amounts.get(id) ?? [], currency, rates);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!this.canSeeBatches(au)) return this.json([], 401);
      const data = await this.repos.donationBatch.loadAll(au.churchId);
      const amounts = await this.repos.donationBatch.loadAmountsByCurrency(au.churchId);
      const { currency, rates } = await this.loadChurchRates(au.churchId);
      return data.map((batch) => this.withConvertedTotal(batch, amounts.get(batch.id!) ?? [], currency, rates));
    });
  }

  // Someone who enters donations has to be able to pick the batch they are entering into.
  private canSeeBatches(au: any) {
    return au.checkAccess(Permissions.donations.viewSummary) || au.checkAccess(Permissions.donations.enter);
  }

  // totalAmount is the batch total in the church currency; amountsByCurrency keeps the original subtotals.
  private withConvertedTotal(batch: DonationBatch, amounts: { currency: string | null; amount: number; donationCount: number }[], currency: string, rates: Record<string, number>) {
    const converted = ExchangeRateHelper.convertTotals(amounts, currency, rates);
    return {
      ...batch,
      donationCount: amounts.reduce((sum, a) => sum + a.donationCount, 0),
      totalAmount: converted.totalAmount,
      currency: converted.currency,
      isConverted: converted.isConverted,
      amountsByCurrency: converted.amountsByCurrency
    };
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, DonationBatch[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!BatchAccessHelper.canEnter(au)) return this.json({}, 401);
      if (!au.checkAccess(Permissions.donations.edit)) {
        for (const item of req.body) {
          if (item.id && !(await BatchAccessHelper.isBatchOpen(this.repos, au.churchId, item.id))) return this.json({ error: "This batch is closed." }, 403);
        }
      }
      const promises: Promise<DonationBatch>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.donationBatch.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.donationBatch.convertAllToModel(au.churchId, result);
    });
  }

  // Override delete to also remove batch donations
  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      await this.repos.donationBatch.delete(au.churchId, id);
      await this.repos.donation.deleteByBatchId(au.churchId, id);
      return this.json({});
    });
  }

  @httpPost("/:id/close")
  public async close(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      return this.setStatus(au, id, "closed");
    });
  }

  @httpPost("/:id/reopen")
  public async reopen(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      return this.setStatus(au, id, "open");
    });
  }

  private async setStatus(au: any, id: string, status: "open" | "closed") {
    const data = await this.repos.donationBatch.load(au.churchId, id);
    if (!data) return this.json({}, 404);
    await this.repos.donationBatch.setStatus(au.churchId, id, status, au.id);
    return this.repos.donationBatch.convertToModel(au.churchId, await this.repos.donationBatch.load(au.churchId, id));
  }
}
