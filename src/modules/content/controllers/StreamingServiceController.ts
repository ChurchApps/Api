import { controller, httpPost, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import axios from "axios";
import { StreamingService } from "../models/index.js";
import { ContentBaseController } from "./ContentBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { EncryptionHelper, DateHelper } from "@churchapps/apihelper";
import { Environment } from "../helpers/index.js";

@controller("/content/streamingServices")
export class StreamingServiceController extends ContentBaseController {
  @httpGet("/:id/hostChat")
  public async getHostChatRoom(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let room = "";
      if (au.checkAccess(Permissions.chat.host)) room = EncryptionHelper.encrypt(id);
      return { room };
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const services = await this.repos.streamingService.loadAll(au.churchId);
      const promises: Promise<any>[] = [];
      services.forEach((s: StreamingService, index: number, allServices: StreamingService[]) => {
        // Update service time
        if (s.serviceTime < DateHelper.subtractHoursFromNow(6)) {
          if (!s.recurring) {
            promises.push(this.repos.streamingService.delete(s.id, s.churchId));
            // remove blocked Ips
            promises.push(axios.post(Environment.messagingApi + "/blockedIps/clear", [{ serviceId: s.id, churchId: s.churchId }]));
            allServices.splice(index, 1);
          } else {
            while (s.serviceTime < DateHelper.subtractHoursFromNow(6)) s.serviceTime.setDate(s.serviceTime.getDate() + 7);
            promises.push(this.repos.streamingService.save(s));
          }
        }
        s.serviceTime.setMinutes(s.serviceTime.getMinutes() - s.timezoneOffset);
      });
      await Promise.all(promises);

      return services;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.streamingServices.edit)) return this.json({}, 401);
      else {
        await this.repos.streamingService.delete(id, au.churchId);
        // remove blocked Ips
        await axios.post(Environment.messagingApi + "/blockedIps/clear", [{ serviceId: id, churchId: au.churchId }]);
        return null;
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, StreamingService[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.streamingServices.edit)) return this.json({}, 401);
      else {
        let services: StreamingService[] = req.body;
        const promises: Promise<StreamingService>[] = [];
        services.forEach((service) => {
          if (service.churchId === au.churchId) promises.push(this.repos.streamingService.save(service));
        });
        services = await Promise.all(promises);
        return this.json(services, 200);
      }
    });
  }
}
