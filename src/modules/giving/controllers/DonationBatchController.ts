import { controller } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { Permissions } from "../../../shared/helpers/Permissions";

@controller("/giving/donationbatches")
export class DonationBatchController extends GivingCrudController {
  protected crudSettings = {
    repoKey: "donationBatch",
    permissions: { view: Permissions.donations.viewSummary, edit: Permissions.donations.edit },
    routes: ["getById", "getAll", "post", "delete"] as const
  };

  // Override delete to also remove batch donations
  public override async delete(id: string, req: express.Request, res: express.Response): Promise<any> {
    if (!this.crudSettings?.permissions?.edit) return this.json({}, 404);
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(this.crudSettings.permissions.edit)) return this.json({}, 401);
      await this.repositories.donationBatch.delete(au.churchId, id);
      await this.repositories.donation.deleteByBatchId(au.churchId, id);
      return this.json({});
    });
  }
}
