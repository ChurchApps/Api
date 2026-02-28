import express from "express";
import { AuditLog } from "../models/index.js";
import { Repos } from "../repositories/Repos.js";

export class AuditLogHelper {

  public static getClientIp(req: express.Request): string {
    return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket?.remoteAddress || "";
  }

  public static async log(
    repos: Repos,
    churchId: string,
    userId: string,
    category: string,
    action: string,
    entityType?: string,
    entityId?: string,
    details?: object,
    ipAddress?: string
  ): Promise<void> {
    try {
      const log: AuditLog = {
        churchId,
        userId,
        category,
        action,
        entityType,
        entityId,
        details: details ? JSON.stringify(details) : undefined,
        ipAddress
      };
      await repos.auditLog.create(log);
    } catch (e) {
      console.error("AuditLogHelper.log failed:", e);
    }
  }

  public static async logLogin(repos: Repos, churchId: string, userId: string, success: boolean, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "login", success ? "login_success" : "login_failed", "user", userId, details, ipAddress);
  }

  public static async logPermissionChange(repos: Repos, churchId: string, userId: string, action: string, entityType: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "permission", action, entityType, entityId, details, ipAddress);
  }

  public static async logDonationChange(repos: Repos, churchId: string, userId: string, action: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "donation", action, "donation", entityId, details, ipAddress);
  }

  public static async logPersonChange(repos: Repos, churchId: string, userId: string, action: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "person", action, "person", entityId, details, ipAddress);
  }

  public static async logGroupChange(repos: Repos, churchId: string, userId: string, action: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "group", action, "group", entityId, details, ipAddress);
  }

  public static async logFormChange(repos: Repos, churchId: string, userId: string, action: string, entityId: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "form", action, "form", entityId, details, ipAddress);
  }

  public static async logSettingChange(repos: Repos, churchId: string, userId: string, action: string, ipAddress: string, details?: object): Promise<void> {
    await AuditLogHelper.log(repos, churchId, userId, "settings", action, "setting", undefined, details, ipAddress);
  }

  public static diffFields(oldObj: any, newObj: any, fields: string[]): object | null {
    const changes: Record<string, { old: any; new: any }> = {};
    let hasChanges = false;
    for (const field of fields) {
      const oldVal = oldObj?.[field];
      const newVal = newObj?.[field];
      if (oldVal !== newVal && newVal !== undefined) {
        changes[field] = { old: oldVal ?? null, new: newVal };
        hasChanges = true;
      }
    }
    return hasChanges ? changes : null;
  }
}
