import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { EnvironmentBase } from "@churchapps/apihelper";

interface ConfigItem {
  key: string;
  label: string;
  configured: boolean;
  detail?: string;
}

interface ConfigGroup {
  group: string;
  items: ConfigItem[];
}

@controller("/membership/serverHealth")
export class ServerHealthController extends MembershipBaseController {

  @httpGet("/")
  public async getStatus(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);

      const has = (v: unknown) => !!v && String(v).trim() !== "";

      const mailDetail = Environment.mailSystem
        ? Environment.mailSystem === "SMTP"
          ? `SMTP (${has(EnvironmentBase.smtpHost) ? "host set" : "host missing"})`
          : Environment.mailSystem
        : undefined;

      const connectionStatus = Environment.getConnectionStatus();

      const groups: ConfigGroup[] = [
        {
          group: "Core",
          items: [
            { key: "environment", label: "Environment", configured: has(Environment.currentEnvironment), detail: Environment.currentEnvironment },
            { key: "jwtSecret", label: "JWT Secret", configured: has(Environment.jwtSecret) },
            { key: "encryptionKey", label: "Encryption Key", configured: has(Environment.encryptionKey) },
            { key: "supportEmail", label: "Support Email", configured: has(Environment.supportEmail) },
            { key: "b1AdminRoot", label: "B1 Admin URL", configured: has(Environment.b1AdminRoot) }
          ]
        },
        {
          group: "Email",
          items: [
            { key: "mailSystem", label: "Mail System", configured: Environment.isMailConfigured, detail: mailDetail },
            { key: "smtpHost", label: "SMTP Host", configured: has(EnvironmentBase.smtpHost) },
            { key: "smtpUser", label: "SMTP User", configured: has(EnvironmentBase.smtpUser) },
            { key: "smtpPass", label: "SMTP Password", configured: has(EnvironmentBase.smtpPass) }
          ]
        },
        {
          group: "Storage",
          items: [
            { key: "fileStore", label: "File Store", configured: has(Environment.fileStore), detail: Environment.fileStore },
            { key: "s3Bucket", label: "S3 Bucket", configured: has(Environment.s3Bucket) },
            { key: "contentRoot", label: "Content Root URL", configured: has(Environment.contentRoot) },
            { key: "deliveryProvider", label: "Delivery Provider", configured: has(Environment.deliveryProvider), detail: Environment.deliveryProvider }
          ]
        },
        {
          group: "Content / Media",
          items: [
            { key: "youTubeApiKey", label: "YouTube API Key", configured: has(Environment.youTubeApiKey) },
            { key: "vimeoToken", label: "Vimeo Token", configured: has(Environment.vimeoToken) },
            { key: "pexelsKey", label: "Pexels Key", configured: has(Environment.pexelsKey) },
            { key: "apiBibleKey", label: "API.Bible Key", configured: has(Environment.apiBibleKey) },
            { key: "youVersionApiKey", label: "YouVersion API Key", configured: has(Environment.youVersionApiKey) },
            { key: "praiseChartsConsumerKey", label: "PraiseCharts Consumer Key", configured: has(Environment.praiseChartsConsumerKey) },
            { key: "praiseChartsConsumerSecret", label: "PraiseCharts Consumer Secret", configured: has(Environment.praiseChartsConsumerSecret) }
          ]
        },
        {
          group: "AI",
          items: [
            { key: "aiProvider", label: "AI Provider", configured: has(Environment.aiProvider), detail: Environment.aiProvider },
            { key: "openRouterApiKey", label: "OpenRouter API Key", configured: has(Environment.openRouterApiKey) },
            { key: "openAiApiKey", label: "OpenAI API Key", configured: has(Environment.openAiApiKey) }
          ]
        },
        {
          group: "Notifications",
          items: [
            { key: "webPushPublicKey", label: "Web Push Public Key (VAPID)", configured: has(Environment.webPushPublicKey) },
            { key: "webPushPrivateKey", label: "Web Push Private Key (VAPID)", configured: has(Environment.webPushPrivateKey) },
            { key: "webPushSubject", label: "Web Push Subject", configured: has(Environment.webPushSubject) }
          ]
        },
        {
          group: "Integrations",
          items: [
            { key: "googleRecaptchaSecretKey", label: "Google reCAPTCHA Secret", configured: has(Environment.googleRecaptchaSecretKey) },
            { key: "hubspotKey", label: "HubSpot Key", configured: has(Environment.hubspotKey) },
            { key: "caddyHost", label: "Caddy Host", configured: has(Environment.caddyHost) },
            { key: "caddyPort", label: "Caddy Port", configured: has(Environment.caddyPort) }
          ]
        },
        {
          group: "Sub-API URLs",
          items: [
            { key: "membershipApi", label: "Membership API", configured: has(Environment.membershipApi) },
            { key: "attendanceApi", label: "Attendance API", configured: has(Environment.attendanceApi) },
            { key: "contentApi", label: "Content API", configured: has(Environment.contentApi) },
            { key: "givingApi", label: "Giving API", configured: has(Environment.givingApi) },
            { key: "messagingApi", label: "Messaging API", configured: has(Environment.messagingApi) },
            { key: "doingApi", label: "Doing API", configured: has(Environment.doingApi) },
            { key: "storeApi", label: "Store API", configured: has(Environment.storeApi) }
          ]
        },
        {
          group: "Database Connections",
          items: connectionStatus.loaded
            .map((m) => ({ key: `db_${m}`, label: `${m} database`, configured: true }))
            .concat(connectionStatus.missing.map((m) => ({ key: `db_${m}`, label: `${m} database`, configured: false })))
        }
      ];

      return { environment: Environment.currentEnvironment, groups };
    });
  }
}
