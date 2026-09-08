import { RightsLayer, RightsMatrix, RightsUse, UseRule } from "../models/index.js";

// What a license id permits, per use. Pure; the WorshipCommons site carries the same table in
// src/rights.ts as a fallback for payloads without rightsMatrix — keep the two in step.

export const USES: RightsUse[] = ["project", "print", "stream", "arrange", "record"];

const CREDIT = "Credit the writer and link the license";
const NOT_MONETIZED = "Not monetized: no ads, paid downloads, or ticketed streams";
const NON_COMMERCIAL = "Non-commercial use only";
const SA_ARRANGE = "Share alike: release your arrangement or translation under the same license";
const SA_RECORD = "Share alike: a recording carries the same license";
const NO_DERIVATIVES = "No derivatives: no arrangements, translations, or transposed charts may be distributed";
const UNKNOWN = "License not recognised";
const NO_RIGHTS = "No rights recorded";

// project/print for these never needs a CCLI report; anything else is assumed to
const FREE = /^(PD|CC0|WC|CC-BY)/i;

const all = (allowed: boolean, ...conditions: string[]): RightsMatrix =>
  Object.fromEntries(USES.map((u) => [u, { allowed, conditions: [...conditions] } as UseRule])) as RightsMatrix;

const dedupe = (xs: string[]) => [...new Set(xs)];

export class RightsHelper {
  static matrixForLicense(id: string): RightsMatrix {
    const up = (id || "").toUpperCase();
    if (up === "PD" || up === "CC0") return all(true);
    if (up === "WC") {
      const m = all(true);
      m.stream.conditions.push(NOT_MONETIZED);
      m.record.conditions.push(NOT_MONETIZED);
      return m;
    }
    if (up.startsWith("CC-BY")) {
      const m = all(true, CREDIT);
      if (up.includes("-NC")) for (const u of USES) m[u].conditions.push(NON_COMMERCIAL);
      if (up.includes("-SA")) {
        m.arrange.conditions.push(SA_ARRANGE);
        m.record.conditions.push(SA_RECORD);
      }
      if (up.includes("-ND")) m.arrange = { allowed: false, conditions: [NO_DERIVATIVES] };
      return m;
    }
    return all(false, UNKNOWN);
  }

  /** Every non-null layer must allow a use; conditions are the deduped union. No layers → the fallback license, else "No rights recorded". */
  static composeMatrix(layers: (RightsLayer | null | undefined)[], fallbackLicense?: string): RightsMatrix {
    const ids = this.licenses(layers, fallbackLicense);
    if (!ids.length) return all(false, NO_RIGHTS);
    const ms = ids.map((l) => this.matrixForLicense(l));
    return Object.fromEntries(USES.map((u) => [u, { allowed: ms.every((m) => m[u].allowed), conditions: dedupe(ms.flatMap((m) => m[u].conditions)) }])) as RightsMatrix;
  }

  /** True when a US church must report project/print use to CCLI: any layer outside PD / CC0 / WC / CC-BY*. */
  static ccliReport(layers: (RightsLayer | null | undefined)[], fallbackLicense?: string): boolean {
    const ids = this.licenses(layers, fallbackLicense);
    if (!ids.length) return true;
    return !ids.every((l) => FREE.test(l));
  }

  /** The one-line notice printed under a chart when the package has no attribution.txt. */
  static notice(license: string, version?: string): string {
    const up = (license || "").toUpperCase();
    if (up === "PD") return "Public domain. Free for every use, including commercial.";
    if (up === "CC0") return "Released to the public domain under CC0. Free for every use.";
    if (up === "WC") return `WorshipCommons License${version ? ` ${version}` : ""}: free for worship use; not to be monetized.`;
    if (up.startsWith("CC-BY")) return `Creative Commons ${up.replace(/^CC-/, "").replace(/-/g, " ")}${version ? ` ${version}` : ""}: credit the writer and link the license.`;
    return "License not recognised.";
  }

  private static licenses(layers: (RightsLayer | null | undefined)[], fallbackLicense?: string): string[] {
    const ids = layers.filter((l): l is RightsLayer => !!l && !!l.license).map((l) => l.license);
    if (ids.length) return ids;
    return fallbackLicense ? [fallbackLicense] : [];
  }
}
