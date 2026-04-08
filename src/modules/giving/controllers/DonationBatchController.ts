import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { DonationBatch } from "../models/index.js";

@controller("/giving/donationbatches")
export class DonationBatchController extends GivingBaseController {

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json({}, 401);
      const data = await this.repos.donationBatch.load(au.churchId, id);
      return this.repos.donationBatch.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json([], 401);
      const data = await this.repos.donationBatch.loadAll(au.churchId);
      return this.repos.donationBatch.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, DonationBatch[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
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
}
