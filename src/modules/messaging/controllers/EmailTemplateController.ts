import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { EmailTemplate, DeliveryLog } from "../models/index.js";
import { MergeFieldHelper } from "../helpers/MergeFieldHelper.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { TransactionalEmailHelper } from "../../../shared/helpers/TransactionalEmailHelper.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

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
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      const members = await this.getGroupMemberEmailDetails(au.churchId, groupId);
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
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      const saved = await Promise.all(
        req.body.map(async (template) => {
          template.churchId = au.churchId;
          return this.repos.emailTemplate.save(template);
        })
      );
      return this.repos.emailTemplate.convertAllToModel(saved as any[]);
    });
  }

  // Send email to a group or specific people
  @httpPost("/send")
  public async send(req: express.Request<{}, {}, { subject: string; htmlContent: string; groupId?: string; personIds?: string[] }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      const { subject, htmlContent, groupId, personIds } = req.body;
      if (!subject || !htmlContent) return this.json({ error: "subject and htmlContent are required" }, 400);
      if (!groupId && (!personIds || personIds.length === 0)) return this.json({ error: "groupId or personIds is required" }, 400);

      // Load church name for merge fields
      let churchName = "";
      try {
        const membershipRepos = await RepoManager.getRepos<any>("membership");
        const churchRow = await membershipRepos.church.load(au.churchId, au.churchId);
        churchName = churchRow?.name || "";
      } catch { /* church name is optional */ }
      const church = { name: churchName };

      // Load recipients
      let members: GroupMemberEmailDetail[];
      if (groupId) {
        members = await this.getGroupMemberEmailDetails(au.churchId, groupId);
      } else {
        members = await this.getPersonEmailDetails(au.churchId, personIds);
      }

      const eligible = members.filter(m => m.email && m.email.trim() !== "");
      if (eligible.length === 0) return this.json({ error: "No eligible recipients with email addresses" }, 400);

      // Send emails
      let successCount = 0;
      let failCount = 0;
      const from = Environment.supportEmail;
      const replyTo = au.email || undefined;

      for (const member of eligible) {
        const person = { firstName: member.firstName, lastName: member.lastName, displayName: member.displayName, email: member.email };
        const resolvedSubject = MergeFieldHelper.resolve(subject, person, church);
        const resolvedBody = MergeFieldHelper.resolve(htmlContent, person, church);

        try {
          await TransactionalEmailHelper.sendTransactional(from, member.email, churchName || "B1", "", resolvedSubject, resolvedBody, "ChurchEmailTemplate.html", replyTo);
          successCount++;

          const log: DeliveryLog = {
            churchId: au.churchId,
            personId: member.personId,
            contentType: "email",
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
            contentType: "email",
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
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      await this.repos.emailTemplate.delete(au.churchId, id);
      return this.json({});
    });
  }

  private async getGroupMemberEmailDetails(churchId: string, groupId: string): Promise<GroupMemberEmailDetail[]> {
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const members: any[] = await membershipRepos.groupMember.loadForGroup(churchId, groupId);
    const personIds = members.map((m: any) => m.personId).filter(Boolean);
    if (!personIds.length) return [];
    const people: any[] = await membershipRepos.person.loadByIds(churchId, personIds);
    return people.map((p: any) => ({
      personId: p.id,
      firstName: p.firstName || "",
      lastName: p.lastName || "",
      displayName: p.displayName || "",
      email: p.email || ""
    }));
  }

  private async getPersonEmailDetails(churchId: string, personIds: string[]): Promise<GroupMemberEmailDetail[]> {
    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const people: any[] = await membershipRepos.person.loadByIds(churchId, personIds);
    return people.map((p: any) => ({
      personId: p.id,
      firstName: p.firstName || "",
      lastName: p.lastName || "",
      displayName: p.displayName || "",
      email: p.email || ""
    }));
  }
}
