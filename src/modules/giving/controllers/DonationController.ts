import { controller, httpPost, httpGet, interfaces, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController";
import { Donation } from "../models";
import { Permissions } from "../../../shared/helpers/Permissions";
import { EmailHelper } from "@churchapps/apihelper";
import path from "path";

@controller("/giving/donations")
export class DonationController extends GivingBaseController {
  @httpGet("/testEmail")
  public async testEmail(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      let error = "";
      try {
        await EmailHelper.sendEmail({
          from: "support@churchapps.org",
          to: "jeremy@livecs.org",
          subject: "Test Email",
          body: "Test Email"
        });
      } catch (e) {
        error = (e as any).toString();
      }
      const filePath = path.join(__dirname, "../../src/tools/templates/test.html");
      const result = { dir: __dirname, filePath, error };
      return result;
    });
  }

  @httpGet("/summary")
  public async getSummary(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json({}, 401);
      else {
        const repos = await this.getGivingRepositories();
        const startDate = req.query.startDate ? new Date(req.query.startDate.toString()) : new Date(2000, 1, 1);
        const endDate = req.query.endDate ? new Date(req.query.endDate.toString()) : new Date();
        const type = req.query.type?.toString() || "";
        if (type === "person") {
          const result = await repos.donation.loadPersonBasedSummary(au.churchId, startDate, endDate);
          return repos.donation.convertAllToPersonSummary(au.churchId, result as any[]);
        }
        const result = await repos.donation.loadSummary(au.churchId, startDate, endDate);
        return repos.donation.convertAllToSummary(au.churchId, result as any[]);
      }
    });
  }

  @httpGet("/my")
  public async getMy(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getGivingRepositories();
      const result = await repos.donation.loadByPersonId(au.churchId, au.personId);
      return repos.donation.convertAllToModel(au.churchId, result as any[]);
    });
  }

  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.view)) return this.json({}, 401);
      else {
        const repos = await this.getGivingRepositories();
        const data = await repos.donation.load(au.churchId, id);
        const result = repos.donation.convertToModel(au.churchId, data);
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
        const repos = await this.getGivingRepositories();
        let result;
        if (req.query.batchId !== undefined)
          result = await repos.donation.loadByBatchId(au.churchId, req.query.batchId.toString());
        else if (personId) result = await repos.donation.loadByPersonId(au.churchId, personId);
        else result = await repos.donation.loadAll(au.churchId);
        return repos.donation.convertAllToModel(au.churchId, result as any[] as any[]);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Donation[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      else {
        const repos = await this.getGivingRepositories();
        const promises: Promise<Donation>[] = [];
        req.body.forEach((donation) => {
          donation.churchId = au.churchId;
          promises.push(repos.donation.save(donation));
        });
        const result = await Promise.all(promises);
        return repos.donation.convertAllToModel(au.churchId, result as any[] as any[]);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      else {
        const repos = await this.getGivingRepositories();
        await repos.donation.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
