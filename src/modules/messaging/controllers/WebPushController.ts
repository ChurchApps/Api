import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Device } from "../models/index.js";
import { WebPushHelper, WebPushSubscriptionPayload } from "../helpers/WebPushHelper.js";
import { Environment } from "../../../shared/helpers/Environment.js";

interface WebPushEnrollBody {
  subscription: WebPushSubscriptionPayload;
  appName?: string;
  deviceInfo?: string;
  label?: string;
}

@controller("/messaging/webpush")
export class WebPushController extends MessagingBaseController {
  @httpGet("/publicKey")
  public async publicKey(req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => ({
      publicKey: Environment.webPushPublicKey || "",
      enabled: WebPushHelper.isEnabled()
    }));
  }

  @httpPost("/subscribe")
  public async subscribe(req: express.Request<{}, {}, WebPushEnrollBody>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const sub = req.body?.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return { success: false, error: "invalid subscription" };
      }
      const token = WebPushHelper.encodeSubscription(sub);

      let device = await this.repos.device.loadByFcmToken(au.churchId, token);
      if (device) {
        device.personId = au.personId || device.personId;
        device.label = req.body.label || device.label;
        device.deviceInfo = req.body.deviceInfo || device.deviceInfo;
        device.lastActiveDate = new Date();
        await this.repos.device.save(device);
      } else {
        const newDevice: Device = {
          churchId: au.churchId,
          appName: req.body.appName || "B1AppPwa",
          personId: au.personId,
          fcmToken: token,
          label: req.body.label,
          deviceInfo: req.body.deviceInfo,
          registrationDate: new Date(),
          lastActiveDate: new Date()
        };
        device = await this.repos.device.save(newDevice);
      }
      return { success: true, id: device.id };
    });
  }

  @httpPost("/unsubscribe")
  public async unsubscribe(req: express.Request<{}, {}, { endpoint?: string }>, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      const endpoint = req.body?.endpoint;
      if (!endpoint) return { success: false };
      await this.repos.device.deleteByFcmTokenContains(endpoint);
      return { success: true };
    });
  }

  @httpDelete("/subscription/:id")
  public async deleteById(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.device.delete(au.churchId, id);
      return { success: true };
    });
  }
}
