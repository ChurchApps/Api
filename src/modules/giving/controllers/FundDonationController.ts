import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { FundDonation } from "../models";
import { Permissions } from "../../../shared/helpers/Permissions";

@controller("/giving/funddonations")
export class FundDonationController extends GivingCrudController {
  protected crudSettings = {
    repoKey: "fundDonation",
    permissions: { view: Permissions.donations.view, edit: Permissions.donations.edit },
    routes: [] as const
  };
  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repositories.fundDonation.loadByPersonId(au.churchId, au.personId);
    });
  }

  // TODO: This is a temporary endpoint for the basic report. It will be moved to the default get.
  @httpGet("/basic")
  public async getBasic(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let result;
      const startDate = new Date(req.query.startDate.toString());
      const endDate = new Date(req.query.endDate.toString());
      if (req.query.fundName !== undefined) {
        if (req.query.startDate === undefined) result = await this.repositories.fundDonation.loadByFundName(au.churchId, req.query.fundName.toString());
        else {
          result = await this.repositories.fundDonation.loadByFundNameDate(au.churchId, req.query.fundName.toString(), startDate, endDate);
        }
      } else {
        result = await this.repositories.fundDonation.loadAllByDate(au.churchId, startDate, endDate);
      }
      return this.repositories.fundDonation.convertAllToModel(au.churchId, result as any[]);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.view)) return this.json({}, 401);
      else return this.repositories.fundDonation.convertToModel(au.churchId, await this.repositories.fundDonation.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.view)) return this.json({}, 401);
      else {
        let result;

        if (req.query.donationId !== undefined) result = await this.repositories.fundDonation.loadByDonationId(au.churchId, req.query.donationId.toString());
        else if (req.query.personId !== undefined) result = await this.repositories.fundDonation.loadByPersonId(au.churchId, req.query.personId.toString());
        else if (req.query.fundId !== undefined) {
          if (req.query.startDate === undefined) result = await this.repositories.fundDonation.loadByFundId(au.churchId, req.query.fundId.toString());
          else {
            const startDate = new Date(req.query.startDate.toString());
            const endDate = new Date(req.query.endDate!.toString());
            result = await this.repositories.fundDonation.loadByFundIdDate(au.churchId, req.query.fundId.toString(), startDate, endDate);
          }
        } else {
          if (req.query.startDate !== undefined) {
            result = await this.repositories.fundDonation.loadAllByDate(au.churchId, new Date(req.query.startDate.toString()), new Date(req.query.endDate!.toString()));
          } else {
            result = await this.repositories.fundDonation.loadAll(au.churchId);
          }
        }
        return this.repositories.fundDonation.convertAllToModel(au.churchId, result as any[]);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, FundDonation[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      else {
        const promises: Promise<FundDonation>[] = [];
        req.body.forEach((funddonation) => {
          funddonation.churchId = au.churchId;
          promises.push(this.repositories.fundDonation.save(funddonation));
        });
        const result = await Promise.all(promises);
        return this.repositories.fundDonation.convertToModel(au.churchId, result);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      else {
        await this.repositories.fundDonation.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
