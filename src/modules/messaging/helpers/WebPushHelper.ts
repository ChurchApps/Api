import webpush from "web-push";
import { createHash } from "crypto";
import { Environment } from "../../../shared/helpers/Environment.js";

export const WEB_PUSH_PREFIX = "webpush:";

export interface WebPushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushDispatchResult {
  token: string;
  success: boolean;
  gone: boolean;
  retryable: boolean;
  statusCode?: number;
  endpoint?: string;
  endpointHost?: string;
  diagnosticCode?: string;
  errorMessage?: string;
}

export interface WebPushEndpointSummary {
  endpoint?: string;
  endpointHost?: string;
  endpointFingerprint?: string;
}

export class WebPushHelper {
  private static configured = false;

  private static fingerprint(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 12);
  }

  private static summarizeEndpoint(endpoint?: string): WebPushEndpointSummary {
    if (!endpoint) return {};
    try {
      const url = new URL(endpoint);
      return {
        endpoint: endpoint.length > 160 ? `${endpoint.slice(0, 157)}...` : endpoint,
        endpointHost: url.host,
        endpointFingerprint: WebPushHelper.fingerprint(endpoint)
      };
    } catch {
      return {
        endpoint: endpoint.length > 160 ? `${endpoint.slice(0, 157)}...` : endpoint,
        endpointFingerprint: WebPushHelper.fingerprint(endpoint)
      };
    }
  }

  private static classifyError(err: any): { gone: boolean; retryable: boolean; diagnosticCode: string } {
    const statusCode: number | undefined = err?.statusCode;
    if (statusCode === 404 || statusCode === 410) return { gone: true, retryable: false, diagnosticCode: "subscription-gone" };
    if (statusCode === 401 || statusCode === 403) return { gone: false, retryable: false, diagnosticCode: "vapid-auth-failed" };
    if (statusCode === 400 || statusCode === 413) return { gone: false, retryable: false, diagnosticCode: "invalid-payload-or-subscription" };
    if (statusCode === 408 || statusCode === 425 || statusCode === 429) return { gone: false, retryable: true, diagnosticCode: "push-provider-throttled" };
    if (statusCode && statusCode >= 500) return { gone: false, retryable: true, diagnosticCode: "push-provider-server-error" };
    return { gone: false, retryable: true, diagnosticCode: "push-network-or-unknown-error" };
  }

  private static buildPayload(payload: Record<string, unknown>): string {
    return JSON.stringify({
      ...payload,
      sentAt: new Date().toISOString(),
      channel: "webpush",
      schemaVersion: 1
    });
  }

  static getConfigSummary() {
    return {
      enabled: WebPushHelper.isEnabled(),
      instanceId: process.env.HOSTNAME || `pid-${process.pid}`,
      nodeEnv: process.env.NODE_ENV || "",
      publicKeyFingerprint: Environment.webPushPublicKey ? WebPushHelper.fingerprint(Environment.webPushPublicKey) : "",
      privateKeyFingerprint: Environment.webPushPrivateKey ? WebPushHelper.fingerprint(Environment.webPushPrivateKey) : "",
      publicKeySource: Environment.webPushPublicKeySource || "unknown",
      privateKeySource: Environment.webPushPrivateKeySource || "unknown",
      subject: Environment.webPushSubject || "mailto:support@churchapps.org"
    };
  }

  static init() {
    if (WebPushHelper.configured) return;
    if (!Environment.webPushPublicKey || !Environment.webPushPrivateKey) {
      console.warn("[webpush] vapid config missing", WebPushHelper.getConfigSummary());
      return;
    }
    webpush.setVapidDetails(
      Environment.webPushSubject || "mailto:support@churchapps.org",
      Environment.webPushPublicKey,
      Environment.webPushPrivateKey
    );
    WebPushHelper.configured = true;
    console.info("[webpush] vapid configured", WebPushHelper.getConfigSummary());
  }

  static isEnabled(): boolean {
    return !!(Environment.webPushPublicKey && Environment.webPushPrivateKey);
  }

  static isWebPushToken(token?: string): boolean {
    return !!token && token.startsWith(WEB_PUSH_PREFIX);
  }

  static encodeSubscription(sub: WebPushSubscriptionPayload): string {
    return WEB_PUSH_PREFIX + JSON.stringify({
      endpoint: sub.endpoint.trim(),
      keys: { p256dh: sub.keys.p256dh.trim(), auth: sub.keys.auth.trim() }
    });
  }

  static getEndpointFromToken(token?: string): string | null {
    if (!token) return null;
    const decoded = WebPushHelper.decodeSubscription(token);
    return decoded?.endpoint || null;
  }

  static getEndpointSummary(endpoint?: string): WebPushEndpointSummary {
    return WebPushHelper.summarizeEndpoint(endpoint);
  }

  private static decodeSubscription(token: string): WebPushSubscriptionPayload | null {
    if (!WebPushHelper.isWebPushToken(token)) return null;
    try {
      const parsed = JSON.parse(token.substring(WEB_PUSH_PREFIX.length));
      if (!parsed?.endpoint || !parsed?.keys?.p256dh || !parsed?.keys?.auth) return null;
      return {
        endpoint: String(parsed.endpoint).trim(),
        keys: {
          p256dh: String(parsed.keys.p256dh).trim(),
          auth: String(parsed.keys.auth).trim()
        }
      };
    } catch {
      return null;
    }
  }

  static async sendBulkMessages(tokens: string[], title: string, body: string): Promise<WebPushDispatchResult[]> {
    return WebPushHelper.sendBulk(tokens, { title, body });
  }

  static async sendBulkTypedMessages(
    tokens: string[],
    title: string,
    body: string,
    type: string,
    contentId: string,
    extra?: Record<string, unknown>
  ): Promise<WebPushDispatchResult[]> {
    return WebPushHelper.sendBulk(tokens, { title, body, type, contentId, ...(extra || {}) });
  }

  private static async sendBulk(tokens: string[], payload: Record<string, unknown>): Promise<WebPushDispatchResult[]> {
    if (!tokens.length) return [];
    if (!WebPushHelper.isEnabled()) {
      return tokens.map((token) => ({
        token,
        success: false,
        gone: false,
        retryable: false,
        diagnosticCode: "web-push-not-configured",
        errorMessage: "web-push not configured"
      }));
    }
    WebPushHelper.init();

    const body = WebPushHelper.buildPayload(payload);
    const results = await Promise.all(
      tokens.map(async (token): Promise<WebPushDispatchResult> => {
        const sub = WebPushHelper.decodeSubscription(token);
        if (!sub) {
          return {
            token,
            success: false,
            gone: true,
            retryable: false,
            diagnosticCode: "invalid-subscription-token",
            errorMessage: "invalid subscription"
          };
        }
        const endpointSummary = WebPushHelper.summarizeEndpoint(sub.endpoint);
        try {
          await webpush.sendNotification(sub, body, {
            TTL: 60 * 60 * 24,
            urgency: "high",
            topic: WebPushHelper.fingerprint(`${payload.type || "notification"}:${payload.contentId || "unknown"}`).slice(0, 32)
          });
          console.info("[webpush] send success", {
            ...WebPushHelper.getConfigSummary(),
            endpointHost: endpointSummary.endpointHost,
            endpointFingerprint: endpointSummary.endpointFingerprint,
            payloadType: payload.type || "notification"
          });
          return {
            token,
            success: true,
            gone: false,
            retryable: false,
            endpoint: endpointSummary.endpoint,
            endpointHost: endpointSummary.endpointHost
          };
        } catch (err: any) {
          const statusCode: number | undefined = err?.statusCode;
          const classification = WebPushHelper.classifyError(err);
          console.error("[webpush] send failed", {
            ...WebPushHelper.getConfigSummary(),
            statusCode,
            diagnosticCode: classification.diagnosticCode,
            endpointHost: endpointSummary.endpointHost,
            endpointFingerprint: endpointSummary.endpointFingerprint,
            responseBody: err?.body,
            message: err?.message
          });
          return {
            token,
            success: false,
            gone: classification.gone,
            retryable: classification.retryable,
            statusCode,
            endpoint: endpointSummary.endpoint,
            endpointHost: endpointSummary.endpointHost,
            diagnosticCode: classification.diagnosticCode,
            errorMessage: err?.body || err?.message || String(err)
          };
        }
      })
    );
    return results;
  }
}
