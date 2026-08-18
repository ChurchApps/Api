import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { Webhook } from "../models/index.js";
import { WEBHOOK_EVENTS, ALL_WEBHOOK_EVENTS, WebhookSigner, UrlValidator, WebhookDispatcher, WebhookDeliveryWorker, samplePayloadFor, formatForConnector, MailchimpConnector, MAILCHIMP_EVENTS } from "../../../shared/webhooks/index.js";
import { EncryptionHelper } from "@churchapps/apihelper";

const CONNECTOR_TYPES = ["standard", "slack", "discord", "mailchimp"];

@controller("/membership/webhooks")
export class WebhookController extends MembershipBaseController {
  @httpGet("/events")
  public async getEvents(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      return { groups: WEBHOOK_EVENTS, all: ALL_WEBHOOK_EVENTS };
    });
  }

  @httpGet("/deliveries/:deliveryId")
  public async getDelivery(@requestParam("deliveryId") deliveryId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const delivery = await this.repos.webhookDelivery.load(au.churchId, deliveryId);
      return delivery ?? this.json({ error: "Not found" }, 404);
    });
  }

  @httpPost("/deliveries/:deliveryId/redeliver")
  public async redeliver(@requestParam("deliveryId") deliveryId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const original = await this.repos.webhookDelivery.load(au.churchId, deliveryId);
      if (!original) return this.json({ error: "Not found" }, 404);
      return this.repos.webhookDelivery.create({
        churchId: au.churchId,
        webhookId: original.webhookId,
        event: original.event,
        payload: original.payload,
        status: "pending",
        attemptCount: 0
      });
    });
  }

  @httpPost("/:id/test")
  public async test(@requestParam("id") id: string, req: express.Request<{}, {}, { event?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const webhook = await this.repos.webhook.load(au.churchId, id);
      if (!webhook) return this.json({ error: "Not found" }, 404);
      if (webhook.connectorType === "mailchimp") {
        // A sample-payload delivery would write a fake subscriber into the church's real audience.
        const verifyError = await MailchimpConnector.verify(MailchimpConnector.parseConfig(webhook) ?? {});
        return { event: "connection.test", status: verifyError ? "failed" : "succeeded", responseStatus: verifyError ? 400 : 200, responseBody: verifyError ?? "Mailchimp connection verified" };
      }
      const requested = req.body?.event;
      const event = requested && webhook.events?.includes(requested) ? requested : webhook.events?.[0];
      if (!event) return this.json({ error: "Webhook has no subscribed events" }, 400);

      const envelope = { event, churchId: au.churchId, occurredAt: new Date().toISOString(), data: samplePayloadFor(event, au.churchId) };
      const payload = formatForConnector(webhook.connectorType, envelope);
      const delivery = await this.repos.webhookDelivery.create({ churchId: au.churchId, webhookId: webhook.id, event, payload, status: "pending", attemptCount: 0 });
      await WebhookDeliveryWorker.attempt(this.repos, webhook, delivery);
      return delivery;
    });
  }

  @httpGet("/:id/deliveries")
  public async getDeliveries(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      return this.repos.webhookDelivery.loadByWebhook(au.churchId, id, 50);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const webhook = await this.repos.webhook.load(au.churchId, id);
      return webhook ? this.maskSecret(webhook) : this.json({ error: "Not found" }, 404);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const webhooks = await this.repos.webhook.loadAll(au.churchId);
      return webhooks.map((w) => this.maskSecret(w));
    });
  }

  // Secret is returned only on create — the church must store it.
  @httpPost("/")
  public async save(req: express.Request<{}, {}, Webhook>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const input = req.body;

      const events = Array.isArray(input.events) ? input.events : [];
      const invalid = events.filter((e) => !ALL_WEBHOOK_EVENTS.includes(e));
      if (invalid.length > 0) return this.json({ error: "Unknown event(s): " + invalid.join(", ") }, 400);
      if (events.length === 0) return this.json({ error: "At least one event is required" }, 400);

      const connectorType = input.connectorType ?? "standard";
      if (!CONNECTOR_TYPES.includes(connectorType)) return this.json({ error: "Unknown connector type: " + connectorType }, 400);

      let connectorConfig: string | null = null;
      if (connectorType === "mailchimp") {
        const unsupported = events.filter((e) => !MAILCHIMP_EVENTS.includes(e));
        if (unsupported.length > 0) return this.json({ error: "Event(s) not supported by the Mailchimp connector: " + unsupported.join(", ") }, 400);

        let cfg: { apiKey?: string; audienceId?: string } = {};
        try { cfg = typeof input.connectorConfig === "string" ? JSON.parse(input.connectorConfig) : {}; } catch { cfg = {}; }
        if ((!cfg.apiKey || cfg.apiKey === "********") && input.id) {
          const prev = MailchimpConnector.parseConfig(await this.repos.webhook.load(au.churchId, input.id));
          if (prev?.apiKey) cfg.apiKey = prev.apiKey;
        }
        const verifyError = await MailchimpConnector.verify(cfg);
        if (verifyError) return this.json({ error: verifyError }, 400);

        const dc = MailchimpConnector.dataCenter(cfg.apiKey);
        input.url = `https://${dc}.api.mailchimp.com/3.0/lists/${cfg.audienceId}`;
        connectorConfig = EncryptionHelper.encrypt(JSON.stringify({ apiKey: cfg.apiKey, audienceId: cfg.audienceId }));
      } else {
        const urlError = await UrlValidator.validate(input.url ?? "");
        if (urlError) return this.json({ error: urlError }, 400);
      }

      let isNew = false;
      let webhook: Webhook;
      if (input.id) {
        webhook = await this.repos.webhook.load(au.churchId, input.id);
        if (!webhook) return this.json({ error: "Not found" }, 404);
      } else {
        isNew = true;
        webhook = { churchId: au.churchId, secret: WebhookSigner.generateSecret(), createdBy: au.id };
      }

      webhook.name = input.name;
      webhook.url = input.url;
      webhook.events = events;
      webhook.active = input.active !== false;
      webhook.connectorType = connectorType;
      webhook.connectorConfig = connectorConfig;

      const saved = await this.repos.webhook.save(webhook);
      WebhookDispatcher.invalidate(au.churchId);
      // Signing secrets only matter for standard webhooks; connectors never expose theirs.
      return isNew && connectorType !== "mailchimp" ? saved : this.maskSecret(saved);
    });
  }

  @httpPost("/:id/regenerate-secret")
  public async regenerateSecret(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const webhook = await this.repos.webhook.load(au.churchId, id);
      if (!webhook) return this.json({ error: "Not found" }, 404);
      webhook.secret = WebhookSigner.generateSecret();
      await this.repos.webhook.save(webhook);
      WebhookDispatcher.invalidate(au.churchId);
      return { id: webhook.id, secret: webhook.secret };
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      await this.repos.webhook.delete(au.churchId, id);
      WebhookDispatcher.invalidate(au.churchId);
      return {};
    });
  }

  private maskSecret(webhook: Webhook): Webhook {
    const { secret: _secret, connectorConfig: _config, ...rest } = webhook;
    const masked: Webhook = { ...rest, secret: undefined, connectorConfig: undefined };
    if (webhook.connectorType === "mailchimp") {
      const cfg = MailchimpConnector.parseConfig(webhook);
      masked.connectorConfig = JSON.stringify({ apiKey: "********", audienceId: cfg?.audienceId ?? "" });
    }
    return masked;
  }
}
