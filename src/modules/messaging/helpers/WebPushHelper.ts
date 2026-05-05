import webpush from "web-push";
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
  errorMessage?: string;
}

export class WebPushHelper {
  private static configured = false;

  static init() {
    if (WebPushHelper.configured) return;
    if (!Environment.webPushPublicKey || !Environment.webPushPrivateKey) return;
    webpush.setVapidDetails(
      Environment.webPushSubject || "mailto:support@churchapps.org",
      Environment.webPushPublicKey,
      Environment.webPushPrivateKey
    );
    WebPushHelper.configured = true;
  }

  static isEnabled(): boolean {
    return !!(Environment.webPushPublicKey && Environment.webPushPrivateKey);
  }

  static isWebPushToken(token?: string): boolean {
    return !!token && token.startsWith(WEB_PUSH_PREFIX);
  }

  static encodeSubscription(sub: WebPushSubscriptionPayload): string {
    return WEB_PUSH_PREFIX + JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
    });
  }

  private static decodeSubscription(token: string): WebPushSubscriptionPayload | null {
    if (!WebPushHelper.isWebPushToken(token)) return null;
    try {
      const parsed = JSON.parse(token.substring(WEB_PUSH_PREFIX.length));
      if (!parsed?.endpoint || !parsed?.keys?.p256dh || !parsed?.keys?.auth) return null;
      return parsed as WebPushSubscriptionPayload;
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
      return tokens.map((token) => ({ token, success: false, gone: false, errorMessage: "web-push not configured" }));
    }
    WebPushHelper.init();

    const body = JSON.stringify(payload);
    const results = await Promise.all(
      tokens.map(async (token): Promise<WebPushDispatchResult> => {
        const sub = WebPushHelper.decodeSubscription(token);
        if (!sub) return { token, success: false, gone: true, errorMessage: "invalid subscription" };
        try {
          await webpush.sendNotification(sub, body, { TTL: 60 * 60 * 24 });
          return { token, success: true, gone: false };
        } catch (err: any) {
          const statusCode: number | undefined = err?.statusCode;
          const gone = statusCode === 404 || statusCode === 410;
          return {
            token,
            success: false,
            gone,
            errorMessage: err?.body || err?.message || String(err)
          };
        }
      })
    );
    return results;
  }
}
