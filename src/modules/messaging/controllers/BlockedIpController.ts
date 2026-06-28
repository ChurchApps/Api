import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { BlockedIp } from "../models/index.js";
import { DeliveryHelper } from "../helpers/DeliveryHelper.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";

@controller("/messaging/blockedips")
export class BlockedIpController extends MessagingBaseController {
  @httpPost("/")
  public async save(req: express.Request<{}, {}, BlockedIp[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const promises: Promise<BlockedIp>[] = [];
      req.body.forEach((blockedIp) => {
        blockedIp.churchId = au.churchId;
        const promise = this.repos.blockedIp.save(blockedIp).then(async (ip: BlockedIp) => {
          await DeliveryHelper.sendBlockedIps(blockedIp.churchId, blockedIp.conversationId);
          return ip;
        });
        promises.push(promise);
      });
      const result = this.repos.blockedIp.convertAllToModel(au.churchId, await Promise.all(promises));
      return result;
    });
  }

  @httpPost("/clear")
  public async clear(req: express.Request<{}, {}, { serviceId: string; churchId: string }[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      for (const { serviceId } of req.body) {
        const ips = await this.repos.blockedIp.loadByServiceId(au.churchId, serviceId);
        if (ips.length > 0) {
          await this.repos.blockedIp.deleteByServiceId(au.churchId, serviceId);
        }
      }
    });
  }
}
