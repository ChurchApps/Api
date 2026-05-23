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

interface DebugStep {
  step: string;
  status: "start" | "ok" | "warn" | "error";
  data?: Record<string, unknown>;
}

@controller("/messaging/webpush")
export class WebPushController extends MessagingBaseController {
  private addStep(steps: DebugStep[], step: string, status: DebugStep["status"], data?: Record<string, unknown>) {
    steps.push({ step, status, ...(data ? { data } : {}) });
  }

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
      const steps: DebugStep[] = [];
      this.addStep(steps, "load-config-summary", "ok", summary as Record<string, unknown>);
      console.info("[webpush] publicKey requested", {
        ...summary,
        route: "/messaging/webpush/publicKey"
      });
      this.addStep(steps, "evaluate-key-availability", WebPushHelper.isEnabled() ? "ok" : "warn", {
        hasPublicKey: !!Environment.webPushPublicKey,
        hasPrivateKey: !!Environment.webPushPrivateKey,
        webPushEnabled: WebPushHelper.isEnabled()
      });
      const result: Record<string, unknown> = {
        publicKey: Environment.webPushPublicKey || "",
        enabled: WebPushHelper.isEnabled(),
        keyFingerprint: summary.publicKeyFingerprint,
        instanceId: summary.instanceId
      };
      this.addStep(steps, "build-response", "ok", {
        publicKeyReturned: !!Environment.webPushPublicKey,
        enabled: WebPushHelper.isEnabled(),
        instanceId: summary.instanceId
      });
      result.debug = {
        ...this.buildDebugContext(req),
        steps,
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
      const steps: DebugStep[] = [];
      const sub = req.body?.subscription;
      this.addStep(steps, "receive-request", "start", {
        hasSubscription: !!sub,
        appName: req.body?.appName || "B1AppPwa"
      });
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        this.addStep(steps, "validate-subscription-payload", "error", {
          hasEndpoint: !!sub?.endpoint,
          hasP256dh: !!sub?.keys?.p256dh,
          hasAuth: !!sub?.keys?.auth
        });
        return {
          success: false,
          error: "invalid subscription",
          debug: {
            ...this.buildDebugContext(req),
            steps
          }
        };
      }
      this.addStep(steps, "validate-subscription-payload", "ok", {
        hasEndpoint: true,
        hasP256dh: true,
        hasAuth: true
      });
      const token = WebPushHelper.encodeSubscription(sub);
      const normalizedEndpoint = sub.endpoint.trim();
      const endpointSummary = WebPushHelper.getEndpointSummary(normalizedEndpoint);
      this.addStep(steps, "encode-subscription", "ok", {
        tokenType: WebPushHelper.isWebPushToken(token) ? "webpush" : "other",
        endpointHost: endpointSummary.endpointHost,
        endpointFingerprint: endpointSummary.endpointFingerprint
      });
      console.info("[webpush] subscribe auth", {
        churchId: au.churchId,
        personId: au.personId,
        userId: (au as any)?.userId || au.id,
        principalId: au.id
      });
      this.addStep(steps, "load-auth-context", au.personId ? "ok" : "warn", {
        churchId: au.churchId,
        personId: au.personId || null,
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
        this.addStep(steps, "lookup-device-by-exact-token", "ok", { matchedDeviceId: device.id });
      } else {
        this.addStep(steps, "lookup-device-by-exact-token", "warn", { matchedDeviceId: null });
      }
      if (!device) {
        device = await this.repos.device.loadByFcmTokenContains(au.churchId, normalizedEndpoint);
        if (device) {
          matchStrategy = "endpointContains";
          matchedExistingDevice = true;
          this.addStep(steps, "lookup-device-by-endpoint", "ok", { matchedDeviceId: device.id });
        } else {
          this.addStep(steps, "lookup-device-by-endpoint", "warn", { matchedDeviceId: null });
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
        this.addStep(steps, "prepare-existing-device-update", "ok", previousDevice as Record<string, unknown>);
        device.personId = au.personId || device.personId;
        device.fcmToken = token;
        device.appName = req.body.appName || device.appName || "B1AppPwa";
        device.label = req.body.label || device.label;
        device.deviceInfo = req.body.deviceInfo || device.deviceInfo;
        device.lastActiveDate = new Date();
        await this.repos.device.save(device);
        this.addStep(steps, "save-existing-device", "ok", {
          deviceId: device.id,
          savedPersonId: device.personId || null
        });
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
        this.addStep(steps, "create-new-device", "ok", {
          deviceId: device.id,
          savedPersonId: device.personId || null
        });
      }
      duplicateCleanupAttempted = true;
      await this.repos.device.deleteByFcmTokenContainsExceptId(au.churchId, normalizedEndpoint, device.id);
      this.addStep(steps, "cleanup-duplicate-devices", "ok", {
        keepDeviceId: device.id,
        endpointHost: endpointSummary.endpointHost
      });

      const persistedDevice = await this.repos.device.loadById(au.churchId, device.id);
      const persistedToken = persistedDevice?.fcmToken || "";
      const persistedEndpoint = WebPushHelper.getEndpointFromToken(persistedToken);
      const persistedEndpointSummary = persistedEndpoint ? WebPushHelper.getEndpointSummary(persistedEndpoint) : {};
      const savedDeviceReadback = {
        deviceFound: !!persistedDevice,
        tokenLength: persistedToken.length,
        tokenType: WebPushHelper.isWebPushToken(persistedToken) ? "webpush" : (persistedToken ? "other" : "empty"),
        canDecodeEndpoint: !!persistedEndpoint,
        endpointMatchesRequest: persistedEndpoint === normalizedEndpoint,
        endpointHost: persistedEndpointSummary.endpointHost || null,
        endpointFingerprint: persistedEndpointSummary.endpointFingerprint || null,
        likelyTruncated: WebPushHelper.isWebPushToken(persistedToken) && !persistedEndpoint && persistedToken.length <= 255
      };
      this.addStep(
        steps,
        "verify-saved-device-readback",
        savedDeviceReadback.canDecodeEndpoint && savedDeviceReadback.endpointMatchesRequest ? "ok" : "error",
        savedDeviceReadback
      );

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
      this.addStep(steps, "build-response", "ok", {
        success: true,
        deviceId: device.id,
        savedDeviceLinkedToAuthPerson: !!(au.personId && device.personId === au.personId)
      });
      result.debug = {
        ...this.buildDebugContext(req, normalizedEndpoint),
        steps,
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
        savedDeviceReadback,
        checks: {
          duplicateCleanupAttempted,
          savedDeviceLinkedToAuthPerson: !!(au.personId && device.personId === au.personId),
          savedTokenDecodes: savedDeviceReadback.canDecodeEndpoint,
          savedEndpointMatchesRequest: savedDeviceReadback.endpointMatchesRequest,
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
