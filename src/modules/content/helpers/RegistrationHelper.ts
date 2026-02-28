import { EmailHelper } from "@churchapps/apihelper";
import { Environment } from "../../../shared/helpers/Environment.js";
import { Registration, RegistrationMember, Event } from "../models/index.js";

export class RegistrationHelper {

  static async sendConfirmationEmail(email: string, churchName: string, event: Event, registration: Registration, members: RegistrationMember[]) {
    if (!email) return;

    const eventDate = event.start ? new Date(event.start).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";
    const eventTime = event.allDay ? "All Day" : event.start ? new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

    let memberList = "";
    if (members && members.length > 0) {
      memberList = "<h3>Registered Members</h3><ul>";
      members.forEach((m) => {
        memberList += `<li>${m.firstName} ${m.lastName}</li>`;
      });
      memberList += "</ul>";
    }

    const contents = `
      <h2>Registration Confirmed</h2>
      <p>You have been registered for <strong>${event.title}</strong>.</p>
      <table role="presentation" style="text-align: left;" cellspacing="8">
        <tr><td><strong>Date:</strong></td><td>${eventDate}</td></tr>
        <tr><td><strong>Time:</strong></td><td>${eventTime}</td></tr>
        <tr><td><strong>Status:</strong></td><td>${registration.status}</td></tr>
      </table>
      ${memberList}
      <p>If you need to cancel your registration, please visit the church website or contact the church office.</p>
    `;

    await EmailHelper.sendTemplatedEmail(Environment.supportEmail, email, churchName, Environment.b1AdminRoot, "Registration Confirmed: " + event.title, contents);
  }

  static async sendCancellationEmail(email: string, churchName: string, event: Event) {
    if (!email) return;

    const contents = `
      <h2>Registration Cancelled</h2>
      <p>Your registration for <strong>${event.title}</strong> has been cancelled.</p>
      <p>If this was a mistake, please register again on the church website or contact the church office.</p>
    `;

    await EmailHelper.sendTemplatedEmail(Environment.supportEmail, email, churchName, Environment.b1AdminRoot, "Registration Cancelled: " + event.title, contents);
  }
}
