import { Repos } from "../repositories/Repos.js";

// Durable cap for the anonymous group-leader contact endpoint.
//
// Counts live in auditLogs rather than process memory, so the cap holds across Lambda
// instances and cold starts, and the keys are the target church/person - values the caller
// cannot choose - rather than a client IP, which an anonymous caller can rotate or spoof
// through X-Forwarded-For. Counting then inserting is not atomic; a burst of simultaneous
// requests can slip a few over the cap, which is acceptable for a throttle.
export class PublicEmailThrottle {
  static windowMs = 10 * 60 * 1000;
  static maxPerPerson = 5;
  static maxPerChurch = 20;
  static category = "publicEmail";
  static action = "public_email_sent";
  static entityType = "person";

  static async allow(repos: Repos, churchId: string, personId: string): Promise<boolean> {
    const startDate = new Date(Date.now() - this.windowMs);
    const perPerson = await repos.auditLog.loadCount(churchId, { category: this.category, entityType: this.entityType, entityId: personId, startDate });
    if (perPerson >= this.maxPerPerson) return false;
    const perChurch = await repos.auditLog.loadCount(churchId, { category: this.category, startDate });
    return perChurch < this.maxPerChurch;
  }

  static async record(repos: Repos, churchId: string, personId: string, ipAddress: string): Promise<void> {
    await repos.auditLog.create({
      churchId,
      userId: "anonymous",
      category: this.category,
      action: this.action,
      entityType: this.entityType,
      entityId: personId,
      ipAddress,
      module: "membership"
    });
  }
}
