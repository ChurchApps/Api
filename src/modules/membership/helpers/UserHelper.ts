import { LoginUserChurch, RolePermission } from "../models/index.js";
import { Environment, permissionsList } from "./index.js";
import { ArrayHelper, EmailHelper } from "@churchapps/apihelper";

export class UserHelper {
  private static addAllPermissions(luc: LoginUserChurch) {
    permissionsList.forEach((perm) => {
      let api = ArrayHelper.getOne(luc.apis, "keyName", perm.apiName);
      if (api === null) {
        api = { keyName: perm.apiName, permissions: [] };
        luc.apis.push(api);
      }

      const existing = ArrayHelper.getOne(ArrayHelper.getAll(api.permissions, "contentType", perm.section), "action", perm.action);

      if (!existing) {
        const permission: RolePermission = { action: perm.action, contentType: perm.section, contentId: "" };
        api.permissions.push(permission);
      }
    });
  }

  public static addAllReportingPermissions(lucs: LoginUserChurch[]) {
    lucs.forEach((luc) => {
      this.addReportingPermissions(luc);
    });
  }

  private static addReportingPermissions(luc: LoginUserChurch) {
    const reportingApi = ArrayHelper.getOne(luc.apis, "keyName", "ReportingApi");
    if (reportingApi !== null) {
      luc.apis.forEach((api) => {
        if (api.keyName !== "ReportingApi") {
          api.permissions.forEach((perm) => {
            const reportingPermission = { ...perm, apiName: api.keyName };
            reportingApi.permissions.push(reportingPermission);
          });
        }
      });
    }
  }

  static async replaceDomainAdminPermissions(roleUserChurches: LoginUserChurch[]) {
    roleUserChurches.forEach((luc) => {
      luc.apis.forEach((api) => {
        if (api.keyName === "MembershipApi") {
          for (let i = api.permissions.length - 1; i >= 0; i--) {
            const perm = api.permissions[i];
            if (perm.contentType === "Domain" && perm.action === "Admin") {
              api.permissions.splice(i, 1);
              UserHelper.addAllPermissions(luc);
            }
          }
        }
      });
    });
  }

  static sendWelcomeEmail(email: string, code: string, appName: string, appUrl: string): Promise<any> {
    if (!appName) appName = "ChurchApps";
    if (!appUrl) appUrl = Environment.b1AdminRoot;

    const contents =
      "<h2>Welcome to " + appName + "</h2>" +
      "<p>Enter this verification code in the app to finish creating your account:</p>" +
      `<p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; font-family: monospace; padding: 16px; background: #f3f4f6; border-radius: 6px;">${code}</p>` +
      "<p style=\"color: #6b7280; font-size: 14px;\">This code expires in 15 minutes. If you did not request an account, you can safely ignore this email.</p>";
    return EmailHelper.sendTemplatedEmail(Environment.supportEmail, email, appName, appUrl, "Welcome to " + appName + ".", contents);
  }

  static sendInviteEmail(email: string, personName: string, contextName: string, churchName: string, loginLink: string, isExistingUser: boolean): Promise<any> {
    const appName = churchName || "ChurchApps";
    const appUrl = Environment.b1AdminRoot;
    const actionLabel = isExistingUser ? "Log In" : "Sign Up";
    const subject = "You've been added to " + contextName;
    const contents =
      "<h2>Hello " + personName + ",</h2>" +
      "<p>You have been added to <strong>" + contextName + "</strong> at " + appName + ".</p>" +
      "<p>Click the button below to " + actionLabel.toLowerCase() + " and get started.</p>" +
      `<p><a href="${appUrl}${loginLink}" class="btn btn-primary">${actionLabel}</a></p>`;
    return EmailHelper.sendTemplatedEmail(Environment.supportEmail, email, appName, appUrl, subject, contents);
  }

  static sendForgotEmail(email: string, code: string, appName: string, appUrl: string): Promise<any> {
    if (!appName) appName = "ChurchApps";
    if (!appUrl) appUrl = Environment.b1AdminRoot;

    const contents =
      "<h2>Reset Password</h2>" +
      "<p>Enter this verification code in the app to reset your password:</p>" +
      `<p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; font-family: monospace; padding: 16px; background: #f3f4f6; border-radius: 6px;">${code}</p>` +
      "<p style=\"color: #6b7280; font-size: 14px;\">This code expires in 15 minutes. If you did not request a password reset, you can safely ignore this email.</p>";
    return EmailHelper.sendTemplatedEmail(Environment.supportEmail, email, appName, appUrl, appName + " Password Reset", contents);
  }
}
