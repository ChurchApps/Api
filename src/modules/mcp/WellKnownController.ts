import { BaseHttpController, controller, httpGet } from "inversify-express-utils";
import express from "express";
import { authorizationServerMetadata, protectedResourceMetadata } from "./OAuthMetadata.js";

// Clients try the path-suffixed resource URL (/mcp) first, then the root one.
@controller("/.well-known")
export class WellKnownController extends BaseHttpController {
  @httpGet("/oauth-protected-resource")
  public resource(_req: express.Request, res: express.Response) {
    res.json(protectedResourceMetadata());
  }

  @httpGet("/oauth-protected-resource/mcp")
  public mcpResource(_req: express.Request, res: express.Response) {
    res.json(protectedResourceMetadata());
  }

  @httpGet("/oauth-authorization-server")
  public authorizationServer(_req: express.Request, res: express.Response) {
    res.json(authorizationServerMetadata());
  }
}
