import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Device } from "../models/index.js";
import { WebPushHelper, WebPushSubscriptionPayload } from "../helpers/WebPushHelper.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";

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
    return this.actionWrapperAnon(req, res, async () => {
      const summary = WebPushHelper.getConfigSummary();
      console.info("[webpush] publicKey requested", {
        ...summary,
        route: "/messaging/webpush/publicKey"
      });
      return {
        publicKey: Environment.webPushPublicKey || "",
        enabled: WebPushHelper.isEnabled()
      };
    });
  }

  @httpPost("/subscribe")
  public async subscribe(req: express.Request<{}, {}, WebPushEnrollBody>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const sub = req.body?.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return {
          success: false,
          error: "invalid subscription"
        };
      }
      const token = WebPushHelper.encodeSubscription(sub);
      const normalizedEndpoint = sub.endpoint.trim();
      const endpointSummary = WebPushHelper.getEndpointSummary(normalizedEndpoint);
      console.info("[webpush] subscribe auth", {
        churchId: au.churchId,
        personId: au.personId,
        userId: (au as any)?.userId || au.id,
        principalId: au.id
      });
      if (!au.personId) {
        console.warn("[webpush] subscribe missing personId", {
          churchId: au.churchId,
          userId: (au as any)?.userId || au.id,
          principalId: au.id,
          appName: req.body.appName || "B1AppPwa"
        });
      }

      let device = await this.repos.device.loadByFcmToken(au.churchId, token);
      if (!device) {
        device = await this.repos.device.loadByFcmTokenContains(au.churchId, normalizedEndpoint);
      }

      if (device) {
        device.personId = au.personId || device.personId;
        device.fcmToken = token;
        device.appName = req.body.appName || device.appName || "B1AppPwa";
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
      await this.repos.device.deleteByFcmTokenContainsExceptId(au.churchId, normalizedEndpoint, device.id);

      console.info("[webpush] subscription saved", {
        ...WebPushHelper.getConfigSummary(),
        churchId: au.churchId,
        personId: au.personId,
        userId: (au as any)?.userId || au.id,
        deviceId: device.id,
        appName: device.appName,
        lastActiveDate: device.lastActiveDate,
        tokenType: WebPushHelper.isWebPushToken(device.fcmToken) ? "webpush" : "other",
        endpointHost: endpointSummary.endpointHost
      });
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
      const existing = await this.repos.device.loadById(au.churchId, id);
      if (existing?.personId !== au.personId && !au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.device.delete(au.churchId, id);
      return { success: true };
    });
  }
}
