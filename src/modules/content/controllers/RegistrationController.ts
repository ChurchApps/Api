import { controller, httpPost, httpGet, httpPut, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { Registration, RegistrationMember, RegistrationType, RegistrationSelection, RegistrationCoupon, RegistrationPayment } from "../models/index.js";
import { Permissions, RegistrationHelper, RegistrationPricingHelper } from "../helpers/index.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { WebhookDispatcher } from "../../../shared/webhooks/index.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { GatewayService } from "../../../shared/helpers/GatewayService.js";
import { Environment } from "../../../shared/helpers/Environment.js";

interface RegisterMemberInput { personId?: string; firstName: string; lastName: string; registrationTypeId?: string }
interface RegisterSelectionInput { selectionId: string; quantity?: number; registrationMemberId?: string }

interface RegisterRequest {
  churchId: string;
  eventId: string;
  personId?: string;
  guestInfo?: { firstName: string; lastName: string; email: string; phone?: string };
  members?: RegisterMemberInput[];
  selections?: RegisterSelectionInput[];
  couponCode?: string;
  formSubmissionId?: string;
  provider?: string;
  gatewayId?: string;
  type?: string;
  token?: string;
  id?: string;
  customerId?: string;
  paymentMethodId?: string;
  currency?: string;
}

@controller("/content/registrations")
export class RegistrationController extends ContentBaseController {

  @httpPost("/register")
  public async register(req: express.Request<{}, {}, RegisterRequest>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const data = req.body;
      // authz-exempt: anonymous guest checkout — the public wizard runs logged out and posts churchId directly
      const churchId = data.churchId;

      const event = await this.repos.event.load(churchId, data.eventId);
      if (!event) return this.json({ error: "Event not found" }, 404);
      if (!event.registrationEnabled) return this.json({ error: "Registration is not enabled for this event" }, 400);

      const now = new Date();
      if (event.registrationOpenDate && new Date(event.registrationOpenDate) > now) return this.json({ error: "Registration has not opened yet" }, 400);
      if (event.registrationCloseDate && new Date(event.registrationCloseDate) < now) return this.json({ error: "Registration has closed" }, 400);

      let personId = data.personId || null;
      let householdId: string = null;
      let email: string = null;
      let name = "";
      if (data.guestInfo) {
        const guest = await getMembershipModuleGateway().getOrCreateGuestPerson(churchId, data.guestInfo);
        personId = guest.personId;
        householdId = guest.householdId;
        email = guest.email;
        name = `${data.guestInfo.firstName} ${data.guestInfo.lastName}`.trim();
      } else if (personId) {
        const person = await getMembershipModuleGateway().loadPerson(churchId, personId);
        if (person) {
          householdId = person.householdId;
          email = person.email;
        }
      }

      if (personId) {
        const existingRegs = await this.repos.registration.loadForEvent(churchId, data.eventId);
        const duplicate = existingRegs.find((r: Registration) => r.personId === personId && r.status !== "cancelled");
        if (duplicate) return this.json({ error: "Already registered for this event" }, 409);
      }

      // Validate attendee types + selection choices belong to this event
      const types = await this.repos.registrationType.loadForEvent(churchId, data.eventId);
      const activeTypes = types.filter((t: RegistrationType) => t.active !== false);
      const typeMap = new Map(activeTypes.map((t: RegistrationType) => [t.id, t]));
      const members = data.members || [];
      for (const m of members) {
        if (m.registrationTypeId && !typeMap.has(m.registrationTypeId)) return this.json({ error: "Invalid attendee type" }, 400);
      }

      const selections = await this.repos.registrationSelection.loadForEvent(churchId, data.eventId);
      const activeSelections = selections.filter((s: RegistrationSelection) => s.active !== false);
      const selMap = new Map(activeSelections.map((s: RegistrationSelection) => [s.id, s]));
      const choices = data.selections || [];
      for (const c of choices) {
        if (!selMap.has(c.selectionId)) return this.json({ error: "Invalid selection" }, 400);
      }

      // Server-authoritative pricing — client only sends ids/quantities
      let total = RegistrationPricingHelper.computeTotal(activeTypes, activeSelections, members, choices);

      let couponId: string = null;
      if (data.couponCode) {
        const coupon = await this.repos.registrationCoupon.loadByCode(churchId, data.eventId, data.couponCode);
        const uses = coupon?.id ? await this.repos.registration.countActiveForCoupon(churchId, coupon.id) : 0;
        const validation = RegistrationPricingHelper.validateCoupon(coupon, members.length, uses, now);
        if (!validation.valid) return this.json({ error: "Coupon not valid", reason: validation.reason }, 400);
        total = RegistrationPricingHelper.applyDiscount(total, coupon);
        couponId = coupon.id;
      }

      const registration: Registration = {
        churchId,
        eventId: data.eventId,
        personId,
        householdId,
        status: total > 0 ? "pending" : "confirmed",
        registeredDate: new Date(),
        formSubmissionId: data.formSubmissionId,
        totalAmount: total,
        amountPaid: 0,
        couponId
      };

      const inserted = await this.repos.registration.atomicInsertWithCapacityCheck(registration, event.capacity ?? null);
      if (!inserted) {
        if (event.waitlistEnabled) {
          registration.status = "waitlisted";
          await this.repos.registration.save(registration);
          await this.insertMembers(churchId, registration.id, members, typeMap, true);
          try {
            const church = await getMembershipModuleGateway().loadChurch(churchId);
            await RegistrationHelper.sendConfirmationEmail(email, church?.name || "Church", event, registration, members as any);
          } catch (e) { console.error("Failed to send waitlist email", e); }
          return { ...registration, members, status: "waitlisted" };
        }
        return this.json({ error: "Event is at capacity", status: "full" }, 409);
      }

      // Per-type member inserts with atomic capacity guards
      const memberResult = await this.insertMembers(churchId, registration.id, members, typeMap, false);
      if (!memberResult.ok) {
        await this.deleteCascade(churchId, registration.id);
        return this.json({ error: "Attendee type is at capacity", status: "type-full", registrationTypeId: memberResult.fullTypeId }, 409);
      }

      // Per-selection choice inserts with atomic quantity guards
      const choiceResult = await this.insertChoices(churchId, registration.id, choices, selMap);
      if (!choiceResult.ok) {
        await this.deleteCascade(churchId, registration.id);
        return this.json({ error: "Selection is at capacity", status: "selection-full", selectionId: choiceResult.fullSelectionId }, 409);
      }

      // Charge when priced; free registrations are already confirmed
      if (total > 0) {
        const charge = await this.processRegistrationCharge(churchId, total, data, { personId, email, name });
        if (!charge.ok) {
          await this.deleteCascade(churchId, registration.id);
          return this.json({ error: charge.error || "Payment failed" }, 400);
        }
        if (charge.requiresAction) return { ...registration, members: memberResult.members, payment: charge.data };
        await this.recordPayment(churchId, registration.id, charge, total, data.type, personId);
        registration.amountPaid = total;
        registration.status = "confirmed";
        await this.repos.registration.save(registration);
      }

      await WebhookDispatcher.emit(churchId, "registration.created", { ...registration, members: memberResult.members });

      try {
        const church = await getMembershipModuleGateway().loadChurch(churchId);
        await RegistrationHelper.sendConfirmationEmail(email, church?.name || "Church", event, registration, memberResult.members);
      } catch (e) {
        console.error("Failed to send registration confirmation email", e);
      }

      return { ...registration, members: memberResult.members };
    });
  }

  @httpGet("/types/event/:eventId")
  public async getTypesForEvent(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      // authz-exempt: public wizard needs attendee types for the church's public event
      const churchId = req.query.churchId?.toString();
      if (!churchId) return this.json({ error: "churchId required" }, 400);
      const rows = await this.repos.registrationType.loadActiveWithUsage(churchId, eventId);
      return rows.map((r: any) => {
        const capacity = r.capacity == null ? null : Number(r.capacity);
        const used = Number(r.used) || 0;
        return { ...r, price: r.price == null ? null : Number(r.price), remainingCapacity: capacity == null ? null : Math.max(0, capacity - used) };
      });
    });
  }

  @httpPost("/types")
  public async saveType(req: express.Request<{}, {}, RegistrationType[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      const result: RegistrationType[] = [];
      for (const t of req.body) {
        t.churchId = au.churchId;
        result.push(await this.repos.registrationType.save(t));
      }
      return result;
    });
  }

  @httpDelete("/types/:id")
  public async deleteType(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      await this.repos.registrationType.delete(au.churchId, id);
      return this.json({});
    });
  }

  @httpGet("/selections/event/:eventId")
  public async getSelectionsForEvent(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      // authz-exempt: public wizard needs selections for the church's public event
      const churchId = req.query.churchId?.toString();
      if (!churchId) return this.json({ error: "churchId required" }, 400);
      const rows = await this.repos.registrationSelection.loadActiveWithUsage(churchId, eventId);
      return rows.map((r: any) => {
        const capacity = r.capacity == null ? null : Number(r.capacity);
        const used = Number(r.used) || 0;
        return { ...r, price: r.price == null ? null : Number(r.price), remainingCapacity: capacity == null ? null : Math.max(0, capacity - used) };
      });
    });
  }

  @httpPost("/selections")
  public async saveSelection(req: express.Request<{}, {}, RegistrationSelection[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      const result: RegistrationSelection[] = [];
      for (const s of req.body) {
        s.churchId = au.churchId;
        result.push(await this.repos.registrationSelection.save(s));
      }
      return result;
    });
  }

  @httpDelete("/selections/:id")
  public async deleteSelection(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      await this.repos.registrationSelection.delete(au.churchId, id);
      return this.json({});
    });
  }

  @httpPost("/coupons/validate")
  public async validateCoupon(req: express.Request<{}, {}, { churchId?: string; eventId: string; code: string; memberCount?: number }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      // authz-exempt: public wizard validates a discount code before checkout
      const churchId = req.body.churchId;
      if (!churchId) return this.json({ error: "churchId required" }, 400);
      const coupon = await this.repos.registrationCoupon.loadByCode(churchId, req.body.eventId, req.body.code);
      const uses = coupon?.id ? await this.repos.registration.countActiveForCoupon(churchId, coupon.id) : 0;
      return RegistrationPricingHelper.validateCoupon(coupon, req.body.memberCount ?? 1, uses);
    });
  }

  @httpGet("/coupons/event/:eventId")
  public async getCouponsForEvent(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      const coupons = await this.repos.registrationCoupon.loadForEvent(au.churchId, eventId);
      for (const c of coupons) (c as any).uses = await this.repos.registration.countActiveForCoupon(au.churchId, c.id);
      return coupons;
    });
  }

  @httpPost("/coupons")
  public async saveCoupon(req: express.Request<{}, {}, RegistrationCoupon[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      const result: RegistrationCoupon[] = [];
      for (const c of req.body) {
        c.churchId = au.churchId;
        result.push(await this.repos.registrationCoupon.save(c));
      }
      return result;
    });
  }

  @httpDelete("/coupons/:id")
  public async deleteCoupon(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      await this.repos.registrationCoupon.delete(au.churchId, id);
      return this.json({});
    });
  }

  @httpGet("/payments/:registrationId")
  public async getPayments(@requestParam("registrationId") registrationId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const registration = await this.repos.registration.load(au.churchId, registrationId);
      if (!registration) return this.json({ error: "Registration not found" }, 404);
      if (registration.personId !== au.personId && !au.checkAccess(Permissions.registrations.view)) return this.json({}, 401);
      return await this.repos.registrationPayment.loadForRegistration(au.churchId, registrationId);
    });
  }

  @httpGet("/event/:eventId")
  public async getForEvent(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.view)) return this.json({}, 401);
      const registrations = await this.repos.registration.loadForEvent(au.churchId, eventId);
      for (const reg of registrations) {
        (reg as any).members = await this.repos.registrationMember.loadForRegistration(au.churchId, reg.id);
      }
      return registrations;
    });
  }

  @httpGet("/event/:eventId/count")
  public async getCountForEvent(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      // authz-exempt: public count for the public event's church
      const churchId = req.query.churchId?.toString();
      if (!churchId) return this.json({ error: "churchId required" }, 400);
      const count = await this.repos.registration.countActiveForEvent(churchId, eventId);
      return { count };
    });
  }

  @httpGet("/person/:personId")
  public async getForPerson(@requestParam("personId") personId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (au.personId !== personId && !au.checkAccess(Permissions.registrations.view)) return this.json({}, 401);
      const registrations = await this.repos.registration.loadForPerson(au.churchId, personId);
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
        if (registration.personId !== au.personId && !au.checkAccess(Permissions.registrations.view)) return this.json({}, 401);
        (registration as any).members = await this.repos.registrationMember.loadForRegistration(au.churchId, id);
        (registration as any).selectionChoices = await this.repos.registrationSelectionChoice.loadForRegistration(au.churchId, id);
        (registration as any).payments = await this.repos.registrationPayment.loadForRegistration(au.churchId, id);
        (registration as any).event = await this.repos.event.load(au.churchId, registration.eventId);
      }
      return registration;
    });
  }

  @httpPut("/:id")
  public async edit(@requestParam("id") id: string, req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const registration = await this.repos.registration.load(au.churchId, id);
      if (!registration) return this.json({ error: "Registration not found" }, 404);
      const isSelf = registration.personId === au.personId;
      if (!isSelf && !au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);

      const body = req.body || {};
      if (body.notes !== undefined) registration.notes = body.notes;
      if (body.formSubmissionId !== undefined) registration.formSubmissionId = body.formSubmissionId;

      const types = await this.repos.registrationType.loadForEvent(au.churchId, registration.eventId);
      const activeTypes = types.filter((t: RegistrationType) => t.active !== false);
      const typeMap = new Map(activeTypes.map((t: RegistrationType) => [t.id, t]));
      const selections = await this.repos.registrationSelection.loadForEvent(au.churchId, registration.eventId);
      const activeSelections = selections.filter((s: RegistrationSelection) => s.active !== false);
      const selMap = new Map(activeSelections.map((s: RegistrationSelection) => [s.id, s]));

      // Replace members (with atomic per-type capacity re-check on new type assignments)
      let members: RegisterMemberInput[] = null;
      if (Array.isArray(body.members)) {
        members = body.members;
        for (const m of members) if (m.registrationTypeId && !typeMap.has(m.registrationTypeId)) return this.json({ error: "Invalid attendee type" }, 400);
        await this.repos.registrationMember.deleteForRegistration(au.churchId, id);
        const memberResult = await this.insertMembers(au.churchId, id, members, typeMap, false);
        if (!memberResult.ok) return this.json({ error: "Attendee type is at capacity", status: "type-full", registrationTypeId: memberResult.fullTypeId }, 409);
      }

      // Replace selection choices (with atomic per-selection quantity re-check)
      let choices: RegisterSelectionInput[] = null;
      if (Array.isArray(body.selections)) {
        choices = body.selections;
        for (const c of choices) if (!selMap.has(c.selectionId)) return this.json({ error: "Invalid selection" }, 400);
        await this.repos.registrationSelectionChoice.deleteForRegistration(au.churchId, id);
        const choiceResult = await this.insertChoices(au.churchId, id, choices, selMap);
        if (!choiceResult.ok) return this.json({ error: "Selection is at capacity", status: "selection-full", selectionId: choiceResult.fullSelectionId }, 409);
      }

      // Recompute totalAmount from the current members/choices; do NOT auto-charge or refund.
      // A changed total surfaces as balance-due in admin (overpayment is handled by staff).
      const currentMembers = members || await this.repos.registrationMember.loadForRegistration(au.churchId, id);
      const currentChoices = choices || await this.repos.registrationSelectionChoice.loadForRegistration(au.churchId, id);
      let total = RegistrationPricingHelper.computeTotal(activeTypes, activeSelections, currentMembers as any, currentChoices as any);
      if (registration.couponId) {
        const coupon = await this.repos.registrationCoupon.load(au.churchId, registration.couponId);
        total = RegistrationPricingHelper.applyDiscount(total, coupon);
      }
      registration.totalAmount = total;
      await this.repos.registration.save(registration);

      (registration as any).members = await this.repos.registrationMember.loadForRegistration(au.churchId, id);
      return registration;
    });
  }

  @httpPost("/:id/pay")
  public async pay(@requestParam("id") id: string, req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const registration = await this.repos.registration.load(au.churchId, id);
      if (!registration) return this.json({ error: "Registration not found" }, 404);
      const isSelf = registration.personId === au.personId;
      if (!isSelf && !au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);

      const balance = RegistrationPricingHelper.round(RegistrationPricingHelper.num(registration.totalAmount) - RegistrationPricingHelper.num(registration.amountPaid));
      if (balance <= 0) return this.json({ error: "No balance due" }, 400);

      let email: string = null;
      if (registration.personId) {
        const person = await getMembershipModuleGateway().loadPerson(au.churchId, registration.personId);
        email = person?.email;
      }

      const charge = await this.processRegistrationCharge(au.churchId, balance, req.body, { personId: registration.personId, email, name: "" });
      if (!charge.ok) return this.json({ error: charge.error || "Payment failed" }, 400);
      if (charge.requiresAction) return { ...registration, payment: charge.data };

      await this.recordPayment(au.churchId, id, charge, balance, req.body?.type, registration.personId);
      registration.amountPaid = RegistrationPricingHelper.round(RegistrationPricingHelper.num(registration.amountPaid) + balance);
      if (registration.status === "waitlisted") registration.status = "confirmed";
      await this.repos.registration.save(registration);
      return registration;
    });
  }

  @httpPost("/:id/promote")
  public async promote(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      const registration = await this.repos.registration.load(au.churchId, id);
      if (!registration) return this.json({ error: "Registration not found" }, 404);
      const event = await this.repos.event.load(au.churchId, registration.eventId);
      const promoted = await this.repos.registration.promoteFromWaitlist(au.churchId, registration.eventId, event?.capacity ?? null);
      if (promoted) await this.notifyPromotion(au.churchId, promoted, event);
      return promoted || this.json({ error: "No spot available to promote" }, 409);
    });
  }

  @httpPost("/:id/cancel")
  public async cancel(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const registration = await this.repos.registration.load(au.churchId, id);
      if (!registration) return this.json({ error: "Registration not found" }, 404);
      if (registration.personId !== au.personId && !au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      if (registration.status === "cancelled") return this.json({ error: "Already cancelled" }, 400);

      registration.status = "cancelled";
      registration.cancelledDate = new Date();
      const updated = await this.repos.registration.save(registration);

      const event = await this.repos.event.load(au.churchId, registration.eventId);
      try {
        const person = registration.personId ? await getMembershipModuleGateway().loadPerson(au.churchId, registration.personId) : null;
        if (person?.email) {
          const church = await getMembershipModuleGateway().loadChurch(au.churchId);
          await RegistrationHelper.sendCancellationEmail(person.email, church?.name || "Church", event);
        }
      } catch (e) {
        console.error("Failed to send cancellation email", e);
      }

      const promoted = await this.repos.registration.promoteFromWaitlist(au.churchId, registration.eventId, event?.capacity ?? null);
      if (promoted) await this.notifyPromotion(au.churchId, promoted, event);

      return updated;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.registrations.edit)) return this.json({}, 401);
      const registration = await this.repos.registration.load(au.churchId, id);
      await this.deleteCascade(au.churchId, id);
      if (registration) {
        const event = await this.repos.event.load(au.churchId, registration.eventId);
        const promoted = await this.repos.registration.promoteFromWaitlist(au.churchId, registration.eventId, event?.capacity ?? null);
        if (promoted) await this.notifyPromotion(au.churchId, promoted, event);
      }
      return this.json({});
    });
  }

  private async insertMembers(churchId: string, registrationId: string, members: RegisterMemberInput[], typeMap: Map<string, RegistrationType>, waitlisted: boolean): Promise<{ ok: boolean; members: RegistrationMember[]; fullTypeId?: string }> {
    const saved: RegistrationMember[] = [];
    for (const m of members) {
      const member: RegistrationMember = { churchId, registrationId, personId: m.personId || null, firstName: m.firstName, lastName: m.lastName, registrationTypeId: m.registrationTypeId || null };
      const type = m.registrationTypeId ? typeMap.get(m.registrationTypeId) : undefined;
      const capacity = waitlisted ? null : (type?.capacity ?? null);
      const ok = await this.repos.registrationMember.atomicInsertWithTypeCapacity(member, capacity);
      if (!ok) return { ok: false, members: saved, fullTypeId: m.registrationTypeId };
      saved.push(member);
    }
    return { ok: true, members: saved };
  }

  private async insertChoices(churchId: string, registrationId: string, choices: RegisterSelectionInput[], selMap: Map<string, RegistrationSelection>): Promise<{ ok: boolean; fullSelectionId?: string }> {
    for (const c of choices) {
      const selection = selMap.get(c.selectionId);
      const capacity = selection?.capacity ?? null;
      const ok = await this.repos.registrationSelectionChoice.atomicInsertWithCapacityCheck({ churchId, registrationId, selectionId: c.selectionId, registrationMemberId: c.registrationMemberId || null, quantity: c.quantity ?? 1 }, capacity);
      if (!ok) return { ok: false, fullSelectionId: c.selectionId };
    }
    return { ok: true };
  }

  private async deleteCascade(churchId: string, registrationId: string): Promise<void> {
    await this.repos.registrationSelectionChoice.deleteForRegistration(churchId, registrationId);
    await this.repos.registrationPayment.deleteForRegistration(churchId, registrationId);
    await this.repos.registrationMember.deleteForRegistration(churchId, registrationId);
    await this.repos.registration.delete(churchId, registrationId);
  }

  private async processRegistrationCharge(
    churchId: string,
    amount: number,
    body: any,
    person: { personId?: string; email?: string; name?: string }
  ): Promise<{ ok: boolean; error?: string; requiresAction?: boolean; data?: any; transactionId?: string }> {
    if (!body.provider && !body.gatewayId) return { ok: false, error: "Either provider or gatewayId is required" };
    let gateway: any;
    try {
      const givingRepos = await RepoManager.getRepos<any>("giving");
      gateway = await GatewayService.getGatewayForChurch(churchId, { provider: body.provider, gatewayId: body.gatewayId }, givingRepos.gateway);
    } catch (e: any) {
      return { ok: false, error: e?.message || "Gateway not found" };
    }
    if (!gateway) return { ok: false, error: "Gateway not found" };

    const chargeData: any = {
      amount,
      currency: (body.currency || gateway.currency || "USD").toLowerCase(),
      type: body.type || "card",
      id: body.token || body.id,
      customerId: body.customerId,
      paymentMethodId: body.paymentMethodId,
      funds: [],
      person: { email: person.email, name: person.name },
      church: { churchURL: Environment.b1AdminRoot }
    };
    // Mirror DonateController: KF numeric saved-method ids belong in paymentMethodId (pm-{id}), not the nonce.
    if (gateway.provider?.toLowerCase() === "kingdomfunding" && chargeData.id && !chargeData.paymentMethodId && /^\d+$/.test(String(chargeData.id))) {
      chargeData.paymentMethodId = String(chargeData.id);
      delete chargeData.id;
    }

    let chargeResult: any;
    try {
      chargeResult = await GatewayService.processCharge(gateway, chargeData);
    } catch (e: any) {
      return { ok: false, error: e?.message || "Payment processing failed" };
    }
    if (!chargeResult?.success) return { ok: false, error: chargeResult?.data?.error || chargeResult?.error || "Payment failed" };
    if (chargeResult.data?.status === "requires_action") return { ok: true, requiresAction: true, data: chargeResult.data };
    return { ok: true, data: chargeResult.data, transactionId: chargeResult.transactionId, error: gateway.provider };
  }

  private async recordPayment(churchId: string, registrationId: string, charge: any, amount: number, method: string, personId: string): Promise<void> {
    const payment: RegistrationPayment = {
      churchId,
      registrationId,
      provider: charge.error,
      transactionId: charge.transactionId || charge.data?.id || null,
      method: method || "card",
      amount,
      currency: charge.data?.currency || "usd",
      kind: "charge",
      status: "succeeded",
      personId: personId || null
    };
    await this.repos.registrationPayment.save(payment);
  }

  private async notifyPromotion(churchId: string, promoted: Registration, event: any): Promise<void> {
    try {
      if (!promoted.personId) return;
      const person = await getMembershipModuleGateway().loadPerson(churchId, promoted.personId);
      if (!person?.email) return;
      const church = await getMembershipModuleGateway().loadChurch(churchId);
      const priced = RegistrationPricingHelper.num(promoted.totalAmount) - RegistrationPricingHelper.num(promoted.amountPaid) > 0;
      const payUrl = priced ? `${Environment.b1AdminRoot}` : undefined;
      await RegistrationHelper.sendWaitlistAvailabilityEmail(person.email, church?.name || "Church", event, payUrl);
    } catch (e) {
      console.error("Failed to send waitlist promotion email", e);
    }
  }
}
