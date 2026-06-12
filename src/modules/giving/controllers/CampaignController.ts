import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { Campaign } from "../models/index.js";
import { CampaignHelper } from "../helpers/CampaignHelper.js";

@controller("/giving/campaigns")
export class CampaignController extends GivingBaseController {

  @httpGet("/churchId/:churchId")
  public async getPublic(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const campaigns = this.repos.campaign.convertAllToModel(churchId, await this.repos.campaign.loadPublic(churchId));
      if (campaigns.length === 0) return [];
      const pledges = this.repos.pledge.convertAllToModel(churchId, await this.repos.pledge.loadAll(churchId));
      const giving = await this.repos.campaign.loadGivingTotals(churchId);
      return campaigns.map((c) => CampaignHelper.buildProgress(c, pledges.filter((p) => p.campaignId === c.id), giving.filter((g) => g.campaignId === c.id), false));
    });
  }

  @httpGet("/progress/people")
  public async getPeopleProgress(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json({}, 401);
      const campaigns = this.repos.campaign.convertAllToModel(au.churchId, await this.repos.campaign.loadAll(au.churchId));
      const pledges = this.repos.pledge.convertAllToModel(au.churchId, await this.repos.pledge.loadAll(au.churchId));
      const giving = await this.repos.campaign.loadGivingTotals(au.churchId);
      return CampaignHelper.buildPeopleRows(campaigns, pledges, giving);
    });
  }

  @httpGet("/progress")
  public async getAllProgress(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json({}, 401);
      const campaigns = this.repos.campaign.convertAllToModel(au.churchId, await this.repos.campaign.loadAll(au.churchId));
      if (campaigns.length === 0) return [];
      const pledges = this.repos.pledge.convertAllToModel(au.churchId, await this.repos.pledge.loadAll(au.churchId));
      const giving = await this.repos.campaign.loadGivingTotals(au.churchId);
      return campaigns.map((c) => CampaignHelper.buildProgress(c, pledges.filter((p) => p.campaignId === c.id), giving.filter((g) => g.campaignId === c.id), false));
    });
  }

  @httpGet("/:id/progress")
  public async getProgress(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json({}, 401);
      const campaign = this.repos.campaign.convertToModel(au.churchId, await this.repos.campaign.load(au.churchId, id));
      if (!campaign) return this.json({}, 404);
      const pledges = this.repos.pledge.convertAllToModel(au.churchId, await this.repos.pledge.loadByCampaignId(au.churchId, id));
      const giving = await this.repos.campaign.loadGivingTotals(au.churchId, id);
      return CampaignHelper.buildProgress(campaign, pledges, giving, true);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.campaign.load(au.churchId, id);
      return this.repos.campaign.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.campaign.loadAll(au.churchId);
      return this.repos.campaign.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Campaign[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      const promises: Promise<Campaign>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.campaign.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.campaign.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      await this.repos.pledge.deleteByCampaignId(au.churchId, id);
      await this.repos.campaign.delete(au.churchId, id);
      return {};
    });
  }
}
