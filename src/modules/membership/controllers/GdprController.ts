import { controller, httpGet, httpDelete } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { GdprExportHelper } from "../helpers/GdprExportHelper.js";
import { GdprErasureHelper } from "../helpers/GdprErasureHelper.js";

@controller("/membership/gdpr")
export class GdprController extends MembershipBaseController {

  /** Admin: export all data for a person */
  @httpGet("/people/:personId/export")
  public async exportPerson(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.denyAccess(["Access denied"]);
      const personId = req.params.personId;
      return GdprExportHelper.exportPersonData(au.churchId, personId, this.repos);
    });
  }

  /** Admin: anonymize a person across all modules */
  @httpDelete("/people/:personId/anonymize")
  public async anonymizePerson(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.denyAccess(["Access denied"]);
      const personId = req.params.personId;

      // Look up the userId for this person (if they have a user account)
      const userChurch = await this.repos.userChurch.loadByPersonId(personId, au.churchId);
      const userId = userChurch?.userId || null;

      await GdprErasureHelper.anonymize(au.churchId, personId, userId, this.repos);
      return {};
    });
  }

  /** Self-service: export own data */
  @httpGet("/my/export")
  public async exportMyData(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.personId) return this.denyAccess(["No person record linked to this account"]);
      return GdprExportHelper.exportPersonData(au.churchId, au.personId, this.repos);
    });
  }

  /** Self-service: delete own account and anonymize data */
  @httpDelete("/my/account")
  public async deleteMyAccount(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.personId) return this.denyAccess(["No person record linked to this account"]);
      await GdprErasureHelper.anonymize(au.churchId, au.personId, au.id, this.repos);
      return {};
    });
  }

}
