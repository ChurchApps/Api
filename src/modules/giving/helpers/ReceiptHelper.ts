import dayjs from "dayjs";
import { CurrencyHelper } from "@churchapps/apihelper";

export interface ReceiptFund {
  name?: string;
  amount: number;
}

// The gift table shared by the "Thank You For Donating" email and the workflow {{receipt}} merge field.
export class ReceiptHelper {
  static oneTimeTable(funds: ReceiptFund[], amount: number, currency: string = "USD"): string {
    const currencyCode = (currency || "USD").toUpperCase();
    const contentRows = funds.map((fund) => `<tr><td style="font-size: 15px; text-overflow: ellipsis; overflow: hidden;">${ReceiptHelper.escapeHtml(fund.name)}</td><td style="font-size: 15px">${CurrencyHelper.formatCurrencyWithLocale(fund.amount, currencyCode)}</td></tr>`);
    const { transactionFee, formattedFee, formattedTotal } = ReceiptHelper.totals(funds, amount, currencyCode);
    return (
      `<table role="presentation" style="text-align: center;" cellspacing="8" width="80%">
        <tablebody>
          <tr>
            <th style="font-size: 16px" width="50%">Fund</th>
            <th style="font-size: 16px" width="50%">Amount</th>
          </tr>` +
      contentRows.join(" ") +
      `${
        Math.round(transactionFee * 100) === 0
          ? ""
          : `
            <tr style="border-top: solid #dee2e6 1px">
              <th style="font-size: 15px">Transaction Fee</th>
              <td>${formattedFee}</td>
            </tr>
            <tr style="border-top: solid #dee2e6 1px">
              <th style="font-size: 15px">Total</th>
              <td>${formattedTotal}</td>
            </tr>
          `
      }
        </tablebody>
      </table>`
    );
  }

  static recurringTable(funds: ReceiptFund[], amount: number, currency: string, interval?: { interval_count?: number | string; interval?: string }, billingCycleAnchor?: number): string {
    const currencyCode = (currency || "USD").toUpperCase();
    const startDate = dayjs(billingCycleAnchor).format("MMM D, YYYY");
    const contentRows = funds.map((fund, index) => `<tr>${index === 0 ? `<td style="font-size: 15px" rowspan="${funds.length}">${ReceiptHelper.intervalLabel(interval)}<BR><span style="font-size: 13px">(from ${startDate})</span></td>` : ""}<td style="font-size: 15px; text-overflow: ellipsis; overflow: hidden;">${ReceiptHelper.escapeHtml(fund.name)}</td><td style="font-size: 15px">${CurrencyHelper.formatCurrencyWithLocale(fund.amount, currencyCode)}</td></tr>`);
    const { transactionFee, formattedFee, formattedTotal } = ReceiptHelper.totals(funds, amount, currencyCode);
    return (
      `<table role="presentation" style="text-align: center;" cellspacing="8" width="80%">
        <tablebody>
          <tr>
            <th style="font-size: 16px" width="30%">Interval</th>
            <th style="font-size: 16px" width="30%">Fund</th>
            <th style="font-size: 16px" width="30%">Amount</th>
          </tr>` +
      contentRows.join(" ") +
      `${
        Math.round(transactionFee * 100) === 0
          ? ""
          : `
            <tr style="border-top: solid #dee2e6 1px">
              <td></td>
              <th style="font-size: 15px">Transaction Fee</th>
              <td>${formattedFee}</td>
            </tr>
            <tr style="border-top: solid #dee2e6 1px">
              <td></td>
              <th style="font-size: 15px">Total</th>
              <td>${formattedTotal}</td>
            </tr>
          `
      }
        </tablebody>
      </table>`
    );
  }

  private static totals(funds: ReceiptFund[], amount: number, currencyCode: string) {
    const totalFundAmount = funds.reduce((sum, fund) => sum + fund.amount, 0);
    const transactionFee = amount - totalFundAmount;
    return {
      transactionFee,
      formattedFee: CurrencyHelper.formatCurrencyWithLocale(transactionFee, currencyCode),
      formattedTotal: CurrencyHelper.formatCurrencyWithLocale(amount || 0, currencyCode)
    };
  }

  static intervalLabel(interval?: { interval_count?: number | string; interval?: string }): string {
    const count = Math.max(1, Math.min(365, Math.floor(Number(interval?.interval_count) || 1)));
    const unit = ["day", "week", "month", "year"].includes(String(interval?.interval)) ? String(interval?.interval) : "";
    return unit ? `${count} ${unit}` : "";
  }

  static escapeHtml(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
}
