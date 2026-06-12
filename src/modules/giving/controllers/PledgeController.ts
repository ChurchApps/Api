import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { Pledge } from "../models/index.js";
import { CampaignHelper } from "../helpers/CampaignHelper.js";

@controller("/giving/pledges")
export class PledgeController extends GivingBaseController {

  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const pledges = this.repos.pledge.convertAllToModel(au.churchId, await this.repos.pledge.loadByPersonId(au.churchId, au.personId));
      if (pledges.length === 0) return [];
      const campaigns = this.repos.campaign.convertAllToModel(au.churchId, await this.repos.campaign.loadAll(au.churchId));
      const giving = await this.repos.campaign.loadGivingTotals(au.churchId, undefined, au.personId);
      return pledges.map((p) => {
        const campaign = campaigns.find((c) => c.id === p.campaignId) || null;
        const givenAmount = giving.find((g) => g.campaignId === p.campaignId)?.amount || 0;
        return { pledge: p, campaign, givenAmount, status: CampaignHelper.getStatus(p.amount, givenAmount) };
      });
    });
  }

  @httpPost("/my")
  public async saveMy(req: express.Request<{}, {}, { campaignId: string; amount: number }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const campaignId = req.body?.campaignId;
      const amount = Number(req.body?.amount);
      if (!campaignId || !amount || amount <= 0) return this.json({}, 400);
      const campaign = this.repos.campaign.convertToModel(au.churchId, await this.repos.campaign.load(au.churchId, campaignId));
      if (!campaign || !campaign.allowSelfPledge) return this.json({}, 400);
      const existing = this.repos.pledge.convertToModel(au.churchId, await this.repos.pledge.loadByCampaignAndPerson(au.churchId, campaignId, au.personId));
      const pledge: Pledge = existing
        ? { ...existing, amount }
        : { churchId: au.churchId, campaignId, personId: au.personId, amount };
      const result = await this.repos.pledge.save(pledge);
      return this.repos.pledge.convertToModel(au.churchId, result);
    });
  }

  @httpDelete("/my/:id")
  public async deleteMy(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const pledge = this.repos.pledge.convertToModel(au.churchId, await this.repos.pledge.load(au.churchId, id));
      if (!pledge || pledge.personId !== au.personId) return this.json({}, 401);
      await this.repos.pledge.delete(au.churchId, id);
      return this.json({});
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.view)) return this.json({}, 401);
      const data = await this.repos.pledge.load(au.churchId, id);
      return this.repos.pledge.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const personId = req.query?.personId?.toString() || "";
      if (!au.checkAccess(Permissions.donations.view) && personId !== au.personId) return this.json({}, 401);
      let result;
      if (req.query.campaignId !== undefined) result = await this.repos.pledge.loadByCampaignId(au.churchId, req.query.campaignId.toString());
      else if (personId) result = await this.repos.pledge.loadByPersonId(au.churchId, personId);
      else result = await this.repos.pledge.loadAll(au.churchId);
      return this.repos.pledge.convertAllToModel(au.churchId, result as any[]);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Pledge[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      const result: Pledge[] = [];
      for (const item of req.body) {
        item.churchId = au.churchId;
        // One pledge per person per campaign — fold duplicates into an update.
        if (!item.id && item.campaignId && item.personId) {
          const existing = this.repos.pledge.convertToModel(au.churchId, await this.repos.pledge.loadByCampaignAndPerson(au.churchId, item.campaignId, item.personId));
          if (existing) item.id = existing.id;
        }
        result.push(await this.repos.pledge.save(item));
      }
      return this.repos.pledge.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      await this.repos.pledge.delete(au.churchId, id);
      return this.json({});
    });
  }
}
