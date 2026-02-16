import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import axios from "axios";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { TextingProvider, SentText, DeliveryLog } from "../models/index.js";
import { EncryptionHelper } from "@churchapps/apihelper";
import { getProvider, type TextingProviderConfig } from "@churchapps/texting";
import { Environment } from "../../../shared/helpers/Environment.js";

interface GroupMemberDetail {
  personId: string;
  displayName: string;
  mobilePhone: string;
  optedOut: boolean;
}

interface CategorizedRecipients {
  eligible: GroupMemberDetail[];
  optedOut: GroupMemberDetail[];
  noPhone: GroupMemberDetail[];
}

@controller("/messaging/texting")
export class TextingController extends MessagingBaseController {

  @httpGet("/providers")
  public async getProviders(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const providers = await this.repos.textingProvider.loadByChurchId(au.churchId);
      const result = this.repos.textingProvider.convertAllToModel(providers as any[]);
      // Never return raw credentials to the frontend
      return result.map((p: TextingProvider) => ({ ...p, apiKey: p.apiKey ? "********" : "", apiSecret: p.apiSecret ? "********" : "" }));
    });
  }

  @httpPost("/providers")
  public async saveProvider(req: express.Request<{}, {}, TextingProvider[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const saved = await Promise.all(
        req.body.map(async (provider) => {
          provider.churchId = au.churchId;

          // Load existing record if we need to preserve masked credentials
          let existing: TextingProvider | null = null;
          if (provider.apiKey === "********" || provider.apiSecret === "********") {
            const rows = await this.repos.textingProvider.loadByChurchId(au.churchId);
            const arr = this.repos.textingProvider.convertAllToModel(rows as any[]);
            if (arr.length > 0) existing = arr[0];
          }

          // Encrypt new values or keep existing for masked ones
          if (provider.apiKey && provider.apiKey !== "********") {
            provider.apiKey = EncryptionHelper.encrypt(provider.apiKey);
          } else if (provider.apiKey === "********" && existing) {
            provider.apiKey = existing.apiKey;
          }

          if (provider.apiSecret && provider.apiSecret !== "********") {
            provider.apiSecret = EncryptionHelper.encrypt(provider.apiSecret);
          } else if (provider.apiSecret === "********" && existing) {
            provider.apiSecret = existing.apiSecret;
          }
          return this.repos.textingProvider.save(provider);
        })
      );
      const result = this.repos.textingProvider.convertAllToModel(saved as any[]);
      return result.map((p: TextingProvider) => ({ ...p, apiSecret: "********", apiKey: "********" }));
    });
  }

  @httpDelete("/providers/:id")
  public async deleteProvider(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.textingProvider.delete(au.churchId, id);
      return this.json({});
    });
  }

  @httpGet("/preview/:groupId")
  public async previewGroup(@requestParam("groupId") groupId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const members = await this.getGroupMemberDetails(au.churchId, groupId, au.jwt);
      const { eligible, optedOut, noPhone } = this.categorizeRecipients(members);
      return {
        totalMembers: members.length,
        eligibleCount: eligible.length,
        optedOutCount: optedOut.length,
        noPhoneCount: noPhone.length,
        eligible: eligible.map(m => ({ personId: m.personId, displayName: m.displayName })),
        optedOut: optedOut.map(m => ({ personId: m.personId, displayName: m.displayName })),
        noPhone: noPhone.map(m => ({ personId: m.personId, displayName: m.displayName }))
      };
    });
  }

  @httpPost("/send")
  public async sendToGroup(req: express.Request<{}, {}, { groupId: string; message: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { groupId, message } = req.body;
      if (!groupId || !message) return this.json({ error: "groupId and message are required" }, 400);

      const config = await this.getProviderConfig(au.churchId);
      if (!config) return this.json({ error: "No texting provider configured" }, 400);

      const members = await this.getGroupMemberDetails(au.churchId, groupId, au.jwt);
      const { eligible, optedOut, noPhone } = this.categorizeRecipients(members);

      if (eligible.length === 0) return this.json({ error: "No eligible recipients" }, 400);

      const provider = getProvider(config.providerName);

      // Auto-subscribe eligible numbers if provider supports it
      if (provider.capabilities.addSubscriber) {
        await Promise.allSettled(
          eligible.map(m => {
            const parts = m.displayName.split(" ");
            const firstName = parts[0] || "";
            const lastName = parts.slice(1).join(" ") || "";
            return provider.addSubscriber(config, m.mobilePhone, { firstName, lastName });
          })
        );
      }

      // Send to eligible recipients
      const phones = eligible.map(m => m.mobilePhone);
      const results = await provider.sendBulk(config, phones, message);

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      const sentText: SentText = {
        churchId: au.churchId,
        groupId,
        senderPersonId: au.personId,
        message,
        recipientCount: eligible.length,
        successCount,
        failCount
      };
      const savedSentText = await this.repos.sentText.save(sentText);

      // Save per-recipient delivery logs
      const deliveryPromises: Promise<any>[] = [];

      eligible.forEach((m, i) => {
        const log: DeliveryLog = {
          churchId: au.churchId,
          personId: m.personId,
          contentType: "sentText",
          contentId: savedSentText.id,
          deliveryMethod: "sms",
          deliveryAddress: m.mobilePhone,
          success: results[i]?.success ?? false,
          errorMessage: results[i]?.error
        };
        deliveryPromises.push(this.repos.deliveryLog.save(log));
      });

      optedOut.forEach(m => {
        const log: DeliveryLog = {
          churchId: au.churchId,
          personId: m.personId,
          contentType: "sentText",
          contentId: savedSentText.id,
          deliveryMethod: "sms",
          deliveryAddress: m.mobilePhone,
          success: false,
          errorMessage: "Opted out of text messages"
        };
        deliveryPromises.push(this.repos.deliveryLog.save(log));
      });

      await Promise.allSettled(deliveryPromises);

      return {
        totalMembers: members.length,
        recipientCount: eligible.length,
        successCount,
        failCount,
        optedOutCount: optedOut.length,
        noPhoneCount: noPhone.length
      };
    });
  }

  @httpPost("/sendPerson")
  public async sendToPerson(req: express.Request<{}, {}, { personId: string; phoneNumber: string; message: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { personId, phoneNumber, message } = req.body;
      if (!personId || !phoneNumber || !message) return this.json({ error: "personId, phoneNumber, and message are required" }, 400);

      const config = await this.getProviderConfig(au.churchId);
      if (!config) return this.json({ error: "No texting provider configured" }, 400);

      const provider = getProvider(config.providerName);
      const result = await provider.sendMessage(config, phoneNumber, message);

      const sentText: SentText = {
        churchId: au.churchId,
        recipientPersonId: personId,
        senderPersonId: au.personId,
        message,
        recipientCount: 1,
        successCount: result.success ? 1 : 0,
        failCount: result.success ? 0 : 1
      };
      await this.repos.sentText.save(sentText);

      return { recipientCount: 1, successCount: result.success ? 1 : 0, failCount: result.success ? 0 : 1 };
    });
  }

  @httpGet("/sent")
  public async getSentTexts(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.sentText.loadByChurchId(au.churchId);
      return this.repos.sentText.convertAllToModel(data as any[]);
    });
  }

  @httpGet("/sent/:id/details")
  public async getSentTextDetails(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const row = await this.repos.sentText.loadById(au.churchId, id);
      if (!row) return this.json({ error: "Not found" }, 404);
      const sentText = this.repos.sentText.convertToModel(row);
      const logRows = await this.repos.deliveryLog.loadByContent("sentText", id);
      const deliveryLogs = this.repos.deliveryLog.convertAllToModel(logRows as any[]);
      return { sentText, deliveryLogs };
    });
  }

  private async getProviderConfig(churchId: string): Promise<(TextingProviderConfig & { providerName: string }) | null> {
    const providers = await this.repos.textingProvider.loadByChurchId(churchId);
    const providerList = this.repos.textingProvider.convertAllToModel(providers as any[]);
    if (providerList.length === 0) return null;

    const p = providerList[0];
    if (!p.enabled) return null;

    return {
      providerName: p.provider,
      churchId,
      apiKey: p.apiKey ? EncryptionHelper.decrypt(p.apiKey) : "",
      apiSecret: p.apiSecret ? EncryptionHelper.decrypt(p.apiSecret) : "",
      fromNumber: p.fromNumber
    };
  }

  private async getGroupMemberDetails(churchId: string, groupId: string, jwt: string): Promise<GroupMemberDetail[]> {
    const url = Environment.membershipApi + "/groupmembers?groupId=" + groupId;
    const resp = await axios.get(url, { headers: { Authorization: "Bearer " + jwt } });
    const members: any[] = resp.data || [];
    return members.map((m: any) => ({
      personId: m.personId,
      displayName: m.person?.name?.display || "",
      mobilePhone: m.person?.contactInfo?.mobilePhone || "",
      optedOut: m.person?.optedOut === true || m.person?.optedOut === 1
    }));
  }

  private categorizeRecipients(members: GroupMemberDetail[]): CategorizedRecipients {
    const eligible: GroupMemberDetail[] = [];
    const optedOut: GroupMemberDetail[] = [];
    const noPhone: GroupMemberDetail[] = [];

    for (const m of members) {
      if (!m.mobilePhone || m.mobilePhone.trim() === "") noPhone.push(m);
      else if (m.optedOut) optedOut.push(m);
      else eligible.push(m);
    }

    return { eligible, optedOut, noPhone };
  }
}
