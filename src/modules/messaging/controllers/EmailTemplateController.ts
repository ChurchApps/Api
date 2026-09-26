import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { EmailTemplate } from "../models/index.js";
import { MergeFieldHelper } from "../helpers/MergeFieldHelper.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { TransactionalEmailHelper } from "../../../shared/helpers/TransactionalEmailHelper.js";
import { ChurchEmailLimiter } from "../../../shared/helpers/ChurchEmailLimiter.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

const DAY_MS = 24 * 60 * 60 * 1000;

interface GroupMemberEmailDetail {
  personId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
}

@controller("/messaging/emailTemplates")
export class EmailTemplateController extends MessagingBaseController {

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const rows = await this.repos.emailTemplate.loadByChurchId(au.churchId);
      return this.repos.emailTemplate.convertAllToModel(rows as any[]);
    });
  }

  @httpGet("/mergeFields")
  public async getMergeFields(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      return MergeFieldHelper.availableFields;
    });
  }

  @httpGet("/sendStatus")
  public async sendStatus(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      const status = await ChurchEmailLimiter.status(au.churchId);
      const requested = !status.approved && (await this.repos.deliveryLog.countByMethodSince(au.churchId, "emailApprovalRequest", new Date(Date.now() - 7 * DAY_MS))) > 0;
      return { ...status, requested };
    });
  }

  // Asks the ChurchApps team to approve group email; at most one notice per church per week.
  @httpPost("/requestApproval")
  public async requestApproval(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      if ((await ChurchEmailLimiter.status(au.churchId)).approved) return { requested: false, approved: true };
      if ((await this.repos.deliveryLog.countByMethodSince(au.churchId, "emailApprovalRequest", new Date(Date.now() - 7 * DAY_MS))) > 0) return { requested: true };
      const membershipRepos = await RepoManager.getRepos<any>("membership");
      const church = await membershipRepos.church.loadById(au.churchId);
      const esc = (v: string) => (v || "").replace(/[&<>"]/g, (c) => "&#" + c.charCodeAt(0) + ";");
      const body = "<p><strong>" + esc(church?.name) + "</strong> (" + esc(au.churchId) + ") is asking to send group email.</p>"
        + "<p>Requested by " + esc(au.firstName + " " + au.lastName) + " &lt;" + esc(au.email) + "&gt;. Registered " + esc(String(church?.registrationDate || "")) + ", located in " + esc([church?.city, church?.state, church?.country].filter(Boolean).join(", ")) + ".</p>"
        + "<p>Approve it under Server Admin &gt; Churches.</p>";
      await TransactionalEmailHelper.sendTransactional(Environment.supportEmail, Environment.supportEmail, "B1.church", Environment.b1AdminRoot ?? "", "Group email approval request: " + (church?.name || au.churchId), body);
      await this.repos.deliveryLog.save({ churchId: au.churchId, contentType: "emailApproval", deliveryMethod: "emailApprovalRequest", deliveryAddress: au.email, success: true });
      return { requested: true };
    });
  }

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

  @httpGet("/:id")
  public async getOne(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const row = await this.repos.emailTemplate.loadById(au.churchId, id);
      if (!row) return this.json({ error: "Not found" }, 404);
      return this.repos.emailTemplate.convertToModel(row);
    });
  }

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

  @httpPost("/send")
  public async send(req: express.Request<{}, {}, { subject: string; htmlContent: string; groupId?: string; personIds?: string[] }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.groupMembers.edit)) return this.json({}, 401);
      const { subject, htmlContent, groupId, personIds } = req.body;
      if (!subject || !htmlContent) return this.json({ error: "subject and htmlContent are required" }, 400);
      if (!groupId && (!personIds || personIds.length === 0)) return this.json({ error: "groupId or personIds is required" }, 400);

      let churchName = "";
      try {
        const membershipRepos = await RepoManager.getRepos<any>("membership");
        const churchRow = await membershipRepos.church.load(au.churchId, au.churchId);
        churchName = churchRow?.name || "";
      } catch { /* church name is optional */ }
      const church = { name: churchName };

      let members: GroupMemberEmailDetail[];
      if (groupId) {
        members = await this.getGroupMemberEmailDetails(au.churchId, groupId);
      } else {
        members = await this.getPersonEmailDetails(au.churchId, personIds);
      }

      const eligible = members.filter(m => m.email && m.email.trim() !== "");
      if (eligible.length === 0) return this.json({ error: "No eligible recipients with email addresses" }, 400);
      const status = await ChurchEmailLimiter.status(au.churchId);
      if (!status.approved) return this.json({ error: "Group email hasn't been turned on for this church yet.", code: "emailNotApproved" }, 403);
      if (status.paused) return this.json({ error: "Group email is paused for this church because recent messages bounced or were reported as spam. Contact support.", code: "emailPaused" }, 429);
      const reserved = await ChurchEmailLimiter.reserve(au.churchId, "email", eligible.map((m) => ({ address: m.email, personId: m.personId })));
      if (!reserved) return this.json({ error: "This church can't send that many emails right now. Sending limits grow as your church builds a sending history. Contact support if you need more." }, 429);

      let successCount = 0;
      let failCount = 0;
      const from = Environment.supportEmail;
      const replyTo = au.email || undefined;

      for (let i = 0; i < eligible.length; i++) {
        const member = eligible[i];
        const person = { firstName: member.firstName, lastName: member.lastName, displayName: member.displayName, email: member.email };
        const resolvedSubject = MergeFieldHelper.resolve(subject, person, church);
        const resolvedBody = MergeFieldHelper.resolve(htmlContent, person, church);

        try {
          await TransactionalEmailHelper.sendTransactional(from, member.email, churchName || "B1", "", resolvedSubject, resolvedBody, "ChurchEmailTemplate.html", replyTo);
          successCount++;
          await ChurchEmailLimiter.settle(au.churchId, reserved[i], true);
        } catch (err: any) {
          failCount++;
          await ChurchEmailLimiter.settle(au.churchId, reserved[i], false, err?.message || "Send failed");
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
