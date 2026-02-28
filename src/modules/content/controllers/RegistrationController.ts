import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { Registration, RegistrationMember } from "../models/index.js";
import { Permissions, RegistrationHelper } from "../helpers/index.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

interface RegisterRequest {
  churchId: string;
  eventId: string;
  personId?: string;
  guestInfo?: { firstName: string; lastName: string; email: string; phone?: string };
  members?: { personId?: string; firstName: string; lastName: string }[];
}

@controller("/content/registrations")
export class RegistrationController extends ContentBaseController {

  @httpPost("/register")
  public async register(req: express.Request<{}, {}, RegisterRequest>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const data = req.body;

      // Load event and validate
      const event = await this.repos.event.load(data.churchId, data.eventId);
      if (!event) return this.json({ error: "Event not found" }, 404);
      if (!event.registrationEnabled) return this.json({ error: "Registration is not enabled for this event" }, 400);

      // Check registration window
      const now = new Date();
      if (event.registrationOpenDate && new Date(event.registrationOpenDate) > now) {
        return this.json({ error: "Registration has not opened yet" }, 400);
      }
      if (event.registrationCloseDate && new Date(event.registrationCloseDate) < now) {
        return this.json({ error: "Registration has closed" }, 400);
      }

      // Resolve person
      let personId = data.personId || null;
      let householdId: string = null;
      let email: string = null;

      if (data.guestInfo) {
        // Look up or create guest person via membership module
        const membershipRepos: any = await RepoManager.getRepos("membership");
        const existing = await membershipRepos.person.searchEmail(data.churchId, data.guestInfo.email);
        if (existing && existing.length > 0) {
          personId = existing[0].id;
          householdId = existing[0].householdId;
          email = existing[0].email;
        } else {
          // Create new person + household
          const household = await membershipRepos.household.save({ churchId: data.churchId, name: data.guestInfo.lastName });
          householdId = household.id;
          const person = await membershipRepos.person.save({
            churchId: data.churchId,
            firstName: data.guestInfo.firstName,
            lastName: data.guestInfo.lastName,
            email: data.guestInfo.email,
            mobilePhone: data.guestInfo.phone || null,
            householdId: household.id,
            householdRole: "Head",
            membershipStatus: "Guest"
          });
          personId = person.id;
          email = data.guestInfo.email;
        }
      } else if (personId) {
        // Authenticated user — look up their info
        const membershipRepos: any = await RepoManager.getRepos("membership");
        const person = await membershipRepos.person.load(data.churchId, personId);
        if (person) {
          householdId = person.householdId;
          email = person.email;
        }
      }

      // Check for duplicate registration
      if (personId) {
        const existingRegs = await this.repos.registration.loadForEvent(data.churchId, data.eventId);
        const duplicate = existingRegs.find((r: Registration) => r.personId === personId && r.status !== "cancelled");
        if (duplicate) return this.json({ error: "Already registered for this event" }, 409);
      }

      // Create registration with atomic capacity check
      const registration: Registration = {
        churchId: data.churchId,
        eventId: data.eventId,
        personId,
        householdId,
        status: "confirmed",
        registeredDate: new Date()
      };

      const inserted = await this.repos.registration.atomicInsertWithCapacityCheck(registration, event.capacity);
      if (!inserted) {
        return this.json({ error: "Event is at capacity", status: "full" }, 409);
      }

      // Create registration members
      const members: RegistrationMember[] = [];
      if (data.members && data.members.length > 0) {
        for (const m of data.members) {
          const member: RegistrationMember = {
            churchId: data.churchId,
            registrationId: registration.id,
            personId: m.personId || null,
            firstName: m.firstName,
            lastName: m.lastName
          };
          const saved = await this.repos.registrationMember.save(member);
          members.push(saved);
        }
      }

      // Send confirmation email
      try {
        const membershipRepos: any = await RepoManager.getRepos("membership");
        const church = await membershipRepos.church?.load(data.churchId);
        const churchName = church?.name || "Church";
        await RegistrationHelper.sendConfirmationEmail(email, churchName, event, registration, members);
      } catch (e) {
        // Don't fail registration if email fails
        console.error("Failed to send registration confirmation email", e);
      }

      return { ...registration, members };
    });
  }

  @httpGet("/event/:eventId")
  public async getForEvent(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.view)) return this.json({}, 401);
      const registrations = await this.repos.registration.loadForEvent(au.churchId, eventId);
      // Load members for each registration
      for (const reg of registrations) {
        (reg as any).members = await this.repos.registrationMember.loadForRegistration(au.churchId, reg.id);
      }
      return registrations;
    });
  }

  @httpGet("/event/:eventId/count")
  public async getCountForEvent(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const churchId = req.query.churchId?.toString();
      if (!churchId) return this.json({ error: "churchId required" }, 400);
      const count = await this.repos.registration.countActiveForEvent(churchId, eventId);
      return { count };
    });
  }

  @httpGet("/person/:personId")
  public async getForPerson(@requestParam("personId") personId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const registrations = await this.repos.registration.loadForPerson(au.churchId, personId);
      // Load event details for each registration
      for (const reg of registrations) {
        (reg as any).event = await this.repos.event.load(au.churchId, reg.eventId);
        (reg as any).members = await this.repos.registrationMember.loadForRegistration(au.churchId, reg.id);
      }
      return registrations;
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const registration = await this.repos.registration.load(au.churchId, id);
      if (registration) {
        (registration as any).members = await this.repos.registrationMember.loadForRegistration(au.churchId, id);
        (registration as any).event = await this.repos.event.load(au.churchId, registration.eventId);
      }
      return registration;
    });
  }

  @httpPost("/:id/cancel")
  public async cancel(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const registration = await this.repos.registration.load(au.churchId, id);
      if (!registration) return this.json({ error: "Registration not found" }, 404);
      if (registration.status === "cancelled") return this.json({ error: "Already cancelled" }, 400);

      registration.status = "cancelled";
      registration.cancelledDate = new Date();
      const updated = await this.repos.registration.save(registration);

      // Send cancellation email
      try {
        const membershipRepos: any = await RepoManager.getRepos("membership");
        const person = registration.personId ? await membershipRepos.person.load(au.churchId, registration.personId) : null;
        const email = person?.email;
        if (email) {
          const event = await this.repos.event.load(au.churchId, registration.eventId);
          const church = await membershipRepos.church?.load(au.churchId);
          await RegistrationHelper.sendCancellationEmail(email, church?.name || "Church", event);
        }
      } catch (e) {
        console.error("Failed to send cancellation email", e);
      }

      return updated;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      await this.repos.registrationMember.deleteForRegistration(au.churchId, id);
      await this.repos.registration.delete(au.churchId, id);
      return this.json({});
    });
  }
}
