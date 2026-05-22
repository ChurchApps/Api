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
  private buildDebugContext(req: express.Request, endpoint?: string) {
    return {
      route: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
      config: WebPushHelper.getConfigSummary(),
      endpoint: endpoint ? WebPushHelper.getEndpointSummary(endpoint) : undefined
    };
  }

  @httpGet("/publicKey")
  public async publicKey(req: express.Request, res: express.Response): Promise<unknown> {
    return this.actionWrapperAnon(req, res, async () => {
      const summary = WebPushHelper.getConfigSummary();
      console.info("[webpush] publicKey requested", {
        ...summary,
        route: "/messaging/webpush/publicKey"
      });
      const result: Record<string, unknown> = {
        publicKey: Environment.webPushPublicKey || "",
        enabled: WebPushHelper.isEnabled(),
        keyFingerprint: summary.publicKeyFingerprint,
        instanceId: summary.instanceId
      };
      result.debug = {
        ...this.buildDebugContext(req),
        checks: {
          hasPublicKey: !!Environment.webPushPublicKey,
          hasPrivateKey: !!Environment.webPushPrivateKey,
          webPushEnabled: WebPushHelper.isEnabled(),
          publicKeyServedToClient: !!Environment.webPushPublicKey
        }
      };
      return result;
    });
  }

  @httpPost("/subscribe")
  public async subscribe(req: express.Request<{}, {}, WebPushEnrollBody>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const sub = req.body?.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return { success: false, error: "invalid subscription" };
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

      let matchStrategy = "none";
      let matchedExistingDevice = false;
      let device = await this.repos.device.loadByFcmToken(au.churchId, token);
      if (device) {
        matchStrategy = "exactToken";
        matchedExistingDevice = true;
      }
      if (!device) {
        device = await this.repos.device.loadByFcmTokenContains(au.churchId, normalizedEndpoint);
        if (device) {
          matchStrategy = "endpointContains";
          matchedExistingDevice = true;
        }
      }
      const previousDevice = device ? {
        id: device.id,
        personId: device.personId || null,
        appName: device.appName || null,
        lastActiveDate: device.lastActiveDate || null,
        registrationDate: device.registrationDate || null,
        tokenType: WebPushHelper.isWebPushToken(device.fcmToken) ? "webpush" : "other"
      } : null;
      let duplicateCleanupAttempted = false;
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
      duplicateCleanupAttempted = true;
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
      const result: Record<string, unknown> = { success: true, id: device.id };
      result.debug = {
        ...this.buildDebugContext(req, normalizedEndpoint),
        auth: {
          churchId: au.churchId,
          personId: au.personId || null,
          userId: (au as any)?.userId || au.id,
          principalId: au.id,
          missingPersonId: !au.personId
        },
        request: {
          appName: req.body.appName || "B1AppPwa",
          hasEndpoint: !!sub.endpoint,
          hasP256dh: !!sub.keys?.p256dh,
          hasAuth: !!sub.keys?.auth
        },
        lookup: {
          matchedExistingDevice,
          matchStrategy,
          previousDevice
        },
        savedDevice: {
          id: device.id,
          churchId: device.churchId,
          personId: device.personId || null,
          appName: device.appName || null,
          registrationDate: device.registrationDate || null,
          lastActiveDate: device.lastActiveDate || null,
          tokenType: WebPushHelper.isWebPushToken(device.fcmToken) ? "webpush" : "other"
        },
        checks: {
          duplicateCleanupAttempted,
          savedDeviceLinkedToAuthPerson: !!(au.personId && device.personId === au.personId),
          hasPublicKey: !!Environment.webPushPublicKey,
          hasPrivateKey: !!Environment.webPushPrivateKey,
          webPushEnabled: WebPushHelper.isEnabled()
        }
      };
      return result;
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
