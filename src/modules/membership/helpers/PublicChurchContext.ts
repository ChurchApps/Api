import jwt from "jsonwebtoken";
import express from "express";
import { Environment } from "../../../shared/helpers/Environment.js";

const SITE_PURPOSE = "public-site";

export interface PublicChurchBinding {
  /** churchId proven by a church JWT or a signed site token; null when the request carries no signed church context. */
  churchId: string | null;
  /** true when the request is signed for one church but the body claimed a different one. */
  mismatch: boolean;
}

export class PublicChurchContext {
  static churchIdFromAuth(req: express.Request): string | null {
    const header = req.headers?.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token || token.startsWith("cak_")) return null;
    try {
      const decoded = jwt.verify(token, Environment.jwtSecret);
      if (typeof decoded === "string" || !(decoded as any).churchId) return null;
      return String((decoded as any).churchId);
    } catch {
      return null;
    }
  }

  static createSiteToken(churchId: string, expiresIn = "2h"): string {
    return jwt.sign({ churchId, purpose: SITE_PURPOSE }, Environment.jwtSecret, { expiresIn: expiresIn as any });
  }

  static churchIdFromSiteToken(token: string): string | null {
    if (!token) return null;
    try {
      const decoded = jwt.verify(token, Environment.jwtSecret);
      if (typeof decoded === "string") return null;
      if ((decoded as any).purpose !== SITE_PURPOSE || !(decoded as any).churchId) return null;
      return String((decoded as any).churchId);
    } catch {
      return null;
    }
  }

  // Flat shape rather than a discriminated union: the project compiles with strictNullChecks off, so
  // a `{churchId} | {mismatch} | null` union can never be narrowed by the callers.
  static bind(req: express.Request, claimedChurchId?: string): PublicChurchBinding {
    const fromAuth = this.churchIdFromAuth(req);
    const rawToken = (req.body?.siteToken || req.headers?.["x-site-token"] || "").toString().trim();
    const fromSite = fromAuth ? null : this.churchIdFromSiteToken(rawToken);
    const bound = fromAuth || fromSite;
    if (!bound) return { churchId: null, mismatch: false };
    if (claimedChurchId && claimedChurchId !== bound) return { churchId: null, mismatch: true };
    return { churchId: bound, mismatch: false };
  }
}
