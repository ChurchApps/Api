import { CurrencyHelper } from "@churchapps/apihelper";
import dayjs from "dayjs";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { TransactionalEmailHelper } from "../../../shared/helpers/TransactionalEmailHelper.js";
import { Donation, EventLog, Subscription } from "../models/index.js";

const DUNNING_DAYS = [3, 7];

const HEADINGS: Record<number, string> = {
  0: "We couldn't process your recurring gift",
  3: "Your recurring gift still hasn't gone through",
  7: "Last reminder about your recurring gift"
};

export class DunningHelper {

  static async notify(churchId: string, donation: Donation, day: number, repos: any): Promise<boolean> {
    if (!donation?.id || !donation.personId) return false;

    const providerId = `${donation.id}:${day}`;
    if (await repos.eventLog.loadByProviderId(churchId, providerId)) return false;

    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const person: any = await membershipRepos.person.load(churchId, donation.personId);
    if (!person?.email) return false;
    const church: any = await membershipRepos.church.loadById(churchId);
    if (!church) return false;

    await this.send(person.email, church, donation, day);

    const eventLog: EventLog = {
      id: "",
      churchId,
      provider: "dunning",
      providerId,
      eventType: "dunning",
      status: "sent",
      message: `Day ${day} dunning email sent to ${person.email}`,
      created: new Date()
    };
    await repos.eventLog.save(eventLog);
    return true;
  }

  static async notifyCanceled(churchId: string, subscription: Subscription, repos: any): Promise<boolean> {
    if (!subscription?.id || !subscription.personId) return false;

    const providerId = `${subscription.id}:canceled`;
    if (await repos.eventLog.loadByProviderId(churchId, providerId)) return false;

    const membershipRepos = await RepoManager.getRepos<any>("membership");
    const person: any = await membershipRepos.person.load(churchId, subscription.personId);
    if (!person?.email) return false;
    const church: any = await membershipRepos.church.loadById(churchId);
    if (!church) return false;

    const domain = this.domain(church);
    const contents = `
      <h3 style="font-size: 20px;">Your recurring gift has been canceled</h3>
      <p style="font-size: 15px;">Your recurring donation to ${church.name} was canceled because the payment could not be processed after several attempts. No further charges will be made.</p>
      <p style="font-size: 15px;">If you'd like to keep giving, you can set up a new recurring gift in a minute.</p>
      <h4 style="font-size: 14px;">
        <a href="https://${domain}/mobile/donate" target="_blank" rel="noreferrer noopener">Set up your gift again</a>
      </h4>
    `;
    await TransactionalEmailHelper.sendTransactional(Environment.supportEmail, person.email, church.name, `https://${domain}`, "Your Recurring Donation Was Canceled", contents, "ChurchEmailTemplate.html");

    await repos.eventLog.save({ id: "", churchId, provider: "dunning", providerId, eventType: "dunning", status: "sent", message: `Cancellation email sent to ${person.email}`, created: new Date() } as EventLog);
    return true;
  }

  static async run(): Promise<{ sent: number }> {
    const repos = await RepoManager.getRepos<any>("giving");
    let sent = 0;
    for (const day of DUNNING_DAYS) {
      const donations = (await repos.donation.loadFailedByAge(day)) as Donation[];
      for (const donation of donations) {
        try {
          if (await this.notify(donation.churchId as string, donation, day, repos)) sent++;
        } catch (e) {
          console.error(`[DunningHelper] Day ${day} email failed for donation ${donation.id}:`, e);
        }
      }
    }
    return { sent };
  }

  private static async send(to: string, church: any, donation: Donation, day: number) {
    const domain = this.domain(church);
    const amount = CurrencyHelper.formatCurrencyWithLocale(donation.amount || 0, (donation.currency || "USD").toUpperCase());
    const attemptedOn = dayjs(donation.donationDate).format("MMM D, YYYY");
    const contents = `
      <h3 style="font-size: 20px;">${HEADINGS[day]}</h3>
      <p style="font-size: 15px;">Your recurring donation of ${amount} to ${church.name} could not be processed on ${attemptedOn}. Your bank or card issuer declined the payment.</p>
      <p style="font-size: 15px;">Updating your payment method takes a minute and your giving picks up where it left off.</p>
      <h4 style="font-size: 14px;">
        <a href="https://${domain}/mobile/donate" target="_blank" rel="noreferrer noopener">Update your payment method</a>
      </h4>
    `;

    await TransactionalEmailHelper.sendTransactional(Environment.supportEmail, to, church.name, `https://${domain}`, "Your Recurring Donation Needs Attention", contents, "ChurchEmailTemplate.html");
  }

  private static domain(church: any) {
    return Environment.appEnv === "staging" ? `${church.subDomain}.staging.b1.church` : `${church.subDomain}.b1.church`;
  }
}
