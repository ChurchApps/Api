import { BaseHttpController, controller, httpGet } from "inversify-express-utils";
import express from "express";
import { CHURCHAPPS_FAVICON_ICO } from "./icon.js";

// Connector UIs (claude.ai, ChatGPT) show the MCP host's favicon next to its tools; without this api.churchapps.org 404s.
const FAVICON = Buffer.from(CHURCHAPPS_FAVICON_ICO, "base64");

@controller("/favicon.ico")
export class FaviconController extends BaseHttpController {
  @httpGet("/")
  public favicon(_req: express.Request, res: express.Response) {
    res.setHeader("Content-Type", "image/x-icon");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(FAVICON);
  }
}
