import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import axios from "axios";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { EmailTemplate, DeliveryLog } from "../models/index.js";
import { MergeFieldHelper } from "../helpers/MergeFieldHelper.js";
import { EmailHelper } from "@churchapps/apihelper";
import { Environment } from "../../../shared/helpers/Environment.js";

interface GroupMemberEmailDetail {
  personId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
}

@controller("/messaging/emailTemplates")
export class EmailTemplateController extends MessagingBaseController {

  // List all templates for the authenticated church
  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const rows = await this.repos.emailTemplate.loadByChurchId(au.churchId);
      return this.repos.emailTemplate.convertAllToModel(rows as any[]);
    });
  }

  // Get single template by ID
  @httpGet("/mergeFields")
  public async getMergeFields(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      return MergeFieldHelper.availableFields;
    });
  }

  // Preview email recipient count for a group
  @httpGet("/preview/:groupId")
  public async previewGroup(@requestParam("groupId") groupId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const members = await this.getGroupMemberEmailDetails(groupId, au.jwt);
      const eligible = members.filter(m => m.email && m.email.trim() !== "");
      const noEmail = members.filter(m => !m.email || m.email.trim() === "");
      return {
        totalMembers: members.length,
        eligibleCount: eligible.length,
        noEmailCount: noEmail.length
      };
    });
  }

  // Get single template
  @httpGet("/:id")
  public async getOne(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const row = await this.repos.emailTemplate.loadById(au.churchId, id);
      if (!row) return this.json({ error: "Not found" }, 404);
      return this.repos.emailTemplate.convertToModel(row);
    });
  }

  // Create or update template(s)
  @httpPost("/")
  public async save(req: express.Request<{}, {}, EmailTemplate[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const saved = await Promise.all(
        req.body.map(async (template) => {
          template.churchId = au.churchId;
          return this.repos.emailTemplate.save(template);
        })
      );
      return this.repos.emailTemplate.convertAllToModel(saved as any[]);
    });
  }

  // Send email using template to a group
  @httpPost("/send")
  public async send(req: express.Request<{}, {}, { templateId: string; groupId?: string; personIds?: string[] }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { templateId, groupId, personIds } = req.body;
      if (!templateId) return this.json({ error: "templateId is required" }, 400);
      if (!groupId && (!personIds || personIds.length === 0)) return this.json({ error: "groupId or personIds is required" }, 400);

      // Load template
      const templateRow = await this.repos.emailTemplate.loadById(au.churchId, templateId);
      if (!templateRow) return this.json({ error: "Template not found" }, 404);
      const template = this.repos.emailTemplate.convertToModel(templateRow);

      // Load church name for merge fields
      let churchName = "";
      try {
        const churchResp = await axios.get(Environment.membershipApi + "/churches/" + au.churchId, { headers: { Authorization: "Bearer " + au.jwt } });
        churchName = churchResp.data?.name || "";
      } catch { /* church name is optional */ }
      const church = { name: churchName };

      // Load recipients
      let members: GroupMemberEmailDetail[];
      if (groupId) {
        members = await this.getGroupMemberEmailDetails(groupId, au.jwt);
      } else {
        members = await this.getPersonEmailDetails(personIds, au.jwt);
      }

      const eligible = members.filter(m => m.email && m.email.trim() !== "");
      if (eligible.length === 0) return this.json({ error: "No eligible recipients with email addresses" }, 400);

      // Send emails
      let successCount = 0;
      let failCount = 0;
      const from = Environment.supportEmail;

      for (const member of eligible) {
        const person = {
          firstName: member.firstName,
          lastName: member.lastName,
          displayName: member.displayName,
          email: member.email
        };
        const resolvedSubject = MergeFieldHelper.resolve(template.subject, person, church);
        const resolvedBody = MergeFieldHelper.resolve(template.htmlContent, person, church);

        try {
          await EmailHelper.sendTemplatedEmail(from, member.email, churchName || "B1", "", resolvedSubject, resolvedBody, "ChurchEmailTemplate.html");
          successCount++;

          const log: DeliveryLog = {
            churchId: au.churchId,
            personId: member.personId,
            contentType: "emailTemplate",
            contentId: template.id,
            deliveryMethod: "email",
            deliveryAddress: member.email,
            success: true
          };
          await this.repos.deliveryLog.save(log);
        } catch (err: any) {
          failCount++;
          const log: DeliveryLog = {
            churchId: au.churchId,
            personId: member.personId,
            contentType: "emailTemplate",
            contentId: template.id,
            deliveryMethod: "email",
            deliveryAddress: member.email,
            success: false,
            errorMessage: err?.message || "Send failed"
          };
          await this.repos.deliveryLog.save(log);
        }
      }

      const noEmailCount = members.length - eligible.length;
      return {
        totalMembers: members.length,
        recipientCount: eligible.length,
        successCount,
        failCount,
        noEmailCount
      };
    });
  }

  // Delete template
  @httpDelete("/:churchId/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.emailTemplate.delete(au.churchId, id);
      return this.json({});
    });
  }

  private async getGroupMemberEmailDetails(groupId: string, jwt: string): Promise<GroupMemberEmailDetail[]> {
    const url = Environment.membershipApi + "/groupmembers?groupId=" + groupId;
    const resp = await axios.get(url, { headers: { Authorization: "Bearer " + jwt } });
    const members: any[] = resp.data || [];
    return members.map((m: any) => ({
      personId: m.personId,
      firstName: m.person?.name?.first || "",
      lastName: m.person?.name?.last || "",
      displayName: m.person?.name?.display || "",
      email: m.person?.contactInfo?.email || ""
    }));
  }

  private async getPersonEmailDetails(personIds: string[], jwt: string): Promise<GroupMemberEmailDetail[]> {
    const url = Environment.membershipApi + "/people/ids?ids=" + personIds.join(",");
    const resp = await axios.get(url, { headers: { Authorization: "Bearer " + jwt } });
    const people: any[] = resp.data || [];
    return people.map((p: any) => ({
      personId: p.id,
      firstName: p.name?.first || "",
      lastName: p.name?.last || "",
      displayName: p.name?.display || "",
      email: p.contactInfo?.email || ""
    }));
  }
}
