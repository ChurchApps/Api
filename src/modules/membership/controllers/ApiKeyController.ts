import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import crypto from "crypto";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { ApiKey } from "../models/index.js";
import { listAllScopes, parseScopes, unknownScopes } from "../../../shared/auth/Scopes.js";

@controller("/membership/apiKeys")
export class ApiKeyController extends MembershipBaseController {
  @httpGet("/scopes")
  public async getScopes(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      return { scopes: listAllScopes() };
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const keys = await this.repos.apiKey.loadAll(au.churchId);
      return keys.map((k) => this.maskKey(k));
    });
  }

  // Creates an API key. The raw key (`cak_<prefix>.<secret>`) is returned
  // exactly once here and never again — only its SHA-256 hash is stored. The
  // key is bound to the creating user, so it can never exceed their access.
  @httpPost("/")
  public async create(req: express.Request<{}, {}, { name?: string; scopes?: string | string[]; expiresAt?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const input = req.body;

      const rawScopes = Array.isArray(input.scopes) ? input.scopes.join(" ") : (input.scopes ?? "");
      const scopes = parseScopes(rawScopes);
      const invalid = unknownScopes(scopes);
      if (invalid.length > 0) return this.json({ error: "Unknown scope(s): " + invalid.join(", ") }, 400);

      const prefix = crypto.randomBytes(4).toString("hex");
      const secret = crypto.randomBytes(24).toString("hex");
      const hashedKey = crypto.createHash("sha256").update(secret).digest("hex");

      const key: ApiKey = {
        churchId: au.churchId,
        personId: au.personId,
        userId: au.id,
        name: input.name,
        hashedKey,
        prefix,
        scopes: scopes.join(" "),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined
      };
      const saved = await this.repos.apiKey.save(key);

      // Reveal the full key only on create — the church must store it now.
      return { ...this.maskKey(saved), key: `cak_${prefix}.${secret}` };
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      await this.repos.apiKey.delete(au.churchId, id);
      return {};
    });
  }

  // Never expose the stored hash.
  private maskKey(key: ApiKey): ApiKey {
    const { hashedKey: _hashedKey, ...rest } = key;
    return rest;
  }
}
