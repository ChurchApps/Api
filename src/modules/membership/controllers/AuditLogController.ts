import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { AuditLogFilter } from "../repositories/AuditLogRepo.js";

@controller("/membership/auditlogs")
export class AuditLogController extends MembershipBaseController {

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);

      const filter: AuditLogFilter = {
        category: req.query.category?.toString() || undefined,
        userId: req.query.userId?.toString() || undefined,
        entityType: req.query.entityType?.toString() || undefined,
        entityId: req.query.entityId?.toString() || undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate.toString()) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate.toString()) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit.toString(), 10) : 100,
        offset: req.query.offset ? parseInt(req.query.offset.toString(), 10) : 0
      };

      const [logs, count] = await Promise.all([
        this.repos.auditLog.loadFiltered(au.churchId, filter),
        this.repos.auditLog.loadCount(au.churchId, filter)
      ]);

      return { logs, count, limit: filter.limit, offset: filter.offset };
    });
  }

  @httpGet("/person/:personId")
  public async getForPerson(req: express.Request<{ personId: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);

      const personId = req.params.personId;
      const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset.toString(), 10) : 0;

      const logs = await this.repos.auditLog.loadForPerson(au.churchId, personId, limit, offset);
      return logs;
    });
  }
}
