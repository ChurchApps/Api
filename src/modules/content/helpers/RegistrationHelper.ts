import { Environment } from "../../../shared/helpers/Environment.js";
import { TransactionalEmailHelper } from "../../../shared/helpers/TransactionalEmailHelper.js";
import { Registration, RegistrationMember, Event } from "../models/index.js";

export class RegistrationHelper {

  static escapeHtml(value: unknown): string {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  static validTimeZone(timeZone?: string): string | undefined {
    if (!timeZone) return undefined;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return timeZone;
    } catch {
      return undefined;
    }
  }

  static async sendConfirmationEmail(email: string, churchName: string, event: Event, registration: Registration, members: RegistrationMember[], timeZone?: string) {
    if (!email) return;

    const tz = this.validTimeZone(timeZone);
    const eventDate = event.start ? new Date(event.start).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz }) : "";
    const eventTime = event.allDay ? "All Day" : event.start ? new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" }) : "";

    let memberList = "";
    if (members && members.length > 0) {
      memberList = "<h3>Registered Members</h3><ul>";
      members.forEach((m) => {
        memberList += `<li>${this.escapeHtml(m.firstName)} ${this.escapeHtml(m.lastName)}</li>`;
      });
      memberList += "</ul>";
    }

    const contents = `
      <h2>Registration Confirmed</h2>
      <p>You have been registered for <strong>${this.escapeHtml(event.title)}</strong>.</p>
      <table role="presentation" style="text-align: left;" cellspacing="8">
        <tr><td><strong>Date:</strong></td><td>${eventDate}</td></tr>
        <tr><td><strong>Time:</strong></td><td>${eventTime}</td></tr>
        <tr><td><strong>Status:</strong></td><td>${registration.status}</td></tr>
      </table>
      ${memberList}
      ${this.confirmationMessageHtml(event, registration)}
      <p>If you need to cancel your registration, please visit the church website or contact the church office.</p>
    `;

    await TransactionalEmailHelper.sendTransactional(TransactionalEmailHelper.fromAddress(churchName), email, churchName, Environment.b1AdminRoot, "Registration Confirmed: " + event.title, contents);
  }

  // The event's optional confirmation message is plain text: escape it and keep its line breaks.
  // A waitlisted registrant has no spot yet, so the message (often directions or a meeting link) waits.
  static confirmationMessageHtml(event: Event, registration: Registration): string {
    const message = (event?.confirmationMessage || "").trim();
    if (!message || registration?.status === "waitlisted") return "";
    return `<p>${this.escapeHtml(message).replace(/\r?\n/g, "<br>")}</p>`;
  }

  static async sendBalanceReminderEmail(email: string, churchName: string, event: Event, amounts: { total: string; paid: string; balance: string }, payUrl?: string, timeZone?: string) {
    if (!email) return;

    const tz = this.validTimeZone(timeZone);
    const eventDate = event.start ? new Date(event.start).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz }) : "";
    const payLine = payUrl
      ? `<p>You can <a href="${this.escapeHtml(payUrl)}">pay your balance from My Registrations</a>.</p>`
      : `<p>Please contact the church office to pay your balance.</p>`;

    const contents = `
      <h2>Balance Due</h2>
      <p>Your registration for <strong>${this.escapeHtml(event.title)}</strong> has a balance due.</p>
      <table role="presentation" style="text-align: left;" cellspacing="8">
        ${eventDate ? `<tr><td><strong>Date:</strong></td><td>${eventDate}</td></tr>` : ""}
        <tr><td><strong>Total:</strong></td><td>${this.escapeHtml(amounts.total)}</td></tr>
        <tr><td><strong>Paid:</strong></td><td>${this.escapeHtml(amounts.paid)}</td></tr>
        <tr><td><strong>Balance due:</strong></td><td>${this.escapeHtml(amounts.balance)}</td></tr>
      </table>
      ${payLine}
    `;

    await TransactionalEmailHelper.sendTransactional(TransactionalEmailHelper.fromAddress(churchName), email, churchName, Environment.b1AdminRoot, "Balance Due: " + event.title, contents);
  }

  static async sendWaitlistAvailabilityEmail(email: string, churchName: string, event: Event, payUrl?: string) {
    if (!email) return;

    const payLine = payUrl
      ? `<p>A spot is now available. Please <a href="${payUrl}">complete your registration and payment</a> to secure it.</p>`
      : `<p>A spot is now available and your registration is confirmed.</p>`;

    const contents = `
      <h2>A Spot Is Available</h2>
      <p>Good news! A spot has opened for <strong>${this.escapeHtml(event.title)}</strong> and you have been moved off the waitlist.</p>
      ${payLine}
    `;

    await TransactionalEmailHelper.sendTransactional(TransactionalEmailHelper.fromAddress(churchName), email, churchName, Environment.b1AdminRoot, "Spot Available: " + event.title, contents);
  }

  static async sendCancellationEmail(email: string, churchName: string, event: Event) {
    if (!email) return;

    const contents = `
      <h2>Registration Cancelled</h2>
      <p>Your registration for <strong>${this.escapeHtml(event.title)}</strong> has been cancelled.</p>
      <p>If this was a mistake, please register again on the church website or contact the church office.</p>
    `;

    await TransactionalEmailHelper.sendTransactional(TransactionalEmailHelper.fromAddress(churchName), email, churchName, Environment.b1AdminRoot, "Registration Cancelled: " + event.title, contents);
  }
}
