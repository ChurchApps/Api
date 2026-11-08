import dayjs from "dayjs";
import { CurrencyHelper } from "@churchapps/apihelper";
import { getGivingModuleGateway } from "../../../shared/modules/index.js";
import { EventContext } from "./EventContext.js";

// Gift merge fields ({{amount}}, {{giftDate}}, {{fund}}, {{receipt}}) for cards started by a donation.
export class DonationMergeHelper {
  static async extras(churchId: string, event: EventContext | undefined, format: "html" | "text"): Promise<Record<string, string>> {
    if (event?.type !== "donation.created" || !event.donationId) return {};
    try {
      const giving = getGivingModuleGateway();
      const summary = await giving.loadDonationSummary(churchId, event.donationId);
      if (!summary) return {};
      const currency = (summary.currency || "USD").toUpperCase();
      const amount = CurrencyHelper.formatCurrencyWithLocale(Number(summary.amount || 0), currency);
      const giftDate = summary.donationDate ? dayjs(summary.donationDate).format("MMM D, YYYY") : "";
      const fund = summary.funds.map((f) => f.name).filter(Boolean).join(", ");
      const receipt = format === "html"
        ? `<p>Gift date: ${giftDate}${summary.method ? " · Method: " + DonationMergeHelper.escapeHtml(summary.method) : ""}</p>` + giving.buildReceiptHtml(summary)
        : [amount, fund ? "to " + fund : "", giftDate ? "on " + giftDate : ""].filter(Boolean).join(" ");
      return { amount, giftDate, fund, receipt };
    } catch (err) {
      console.error("[DonationMergeHelper] could not load the gift", err);
      return {};
    }
  }

  private static escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
