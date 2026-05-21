// Re-enters the Express app in-process so an MCP api_call hits every existing
// middleware (CustomAuthProvider, body parsing, audit logging, churchId
// scoping) without needing a network round-trip — important because the API
// runs in Lambda where loopback HTTP is not available.

import { EventEmitter } from "events";
import { Socket } from "net";
import { Application } from "express";
import { URL } from "url";

let expressApp: Application | null = null;

export function setExpressApp(app: Application) {
  expressApp = app;
}

export interface DispatchInput {
  method: string;
  path: string;
  query?: Record<string, any>;
  body?: any;
  authorization?: string;
}

export interface DispatchResult {
  status: number;
  headers: Record<string, string>;
  body: any;
  truncated: boolean;
}

const MAX_BODY_BYTES = 64 * 1024;

export async function dispatch(input: DispatchInput): Promise<DispatchResult> {
  if (!expressApp) throw new Error("Express app not set — call setExpressApp(app) at startup");

  const url = buildUrl(input.path, input.query);
  const isLambda = !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);

  const req = makeRequest(input.method.toUpperCase(), url, input.body, input.authorization, isLambda);
  const res = makeResponse();

  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
    try {
      (expressApp as any)(req, res);
    } catch (err) {
      reject(err);
    }
  });

  return {
    status: res.statusCode,
    headers: res._headers,
    body: res._parsedBody(),
    truncated: res._truncated
  };
}

function buildUrl(path: string, query?: Record<string, any>): string {
  if (!query || Object.keys(query).length === 0) return path;
  const u = new URL("http://internal" + (path.startsWith("/") ? path : "/" + path));
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((item) => u.searchParams.append(k, String(item)));
    else u.searchParams.append(k, String(v));
  }
  return u.pathname + u.search;
}

function makeRequest(method: string, url: string, body: any, authorization: string | undefined, isLambda: boolean): any {
  const req: any = new EventEmitter();
  req.method = method;
  req.url = url;
  req.originalUrl = url;
  req.headers = {
    host: "internal",
    "content-type": "application/json",
    accept: "application/json"
  };
  if (authorization) req.headers.authorization = authorization;

  // The Lambda body-parsing shim in app.ts:60-111 sets _body=true to short-
  // circuit body-parser; the dev server uses bodyParser.json. Either way, we
  // hand the body in already parsed and mark it as such.
  req.body = body ?? {};
  if (isLambda) req._body = true;

  req.socket = new Socket();
  req.connection = req.socket;
  req.httpVersion = "1.1";
  req.complete = true;
  req.readable = false;
  req.aborted = false;

  // Express introspects these for IP / proxy handling; provide safe defaults.
  req.ip = "127.0.0.1";
  req.ips = [];
  req.protocol = "http";
  req.secure = false;
  req.hostname = "internal";
  req.app = expressApp;

  return req;
}

function makeResponse(): any {
  const res: any = new EventEmitter();
  res.statusCode = 200;
  res._headers = {} as Record<string, string>;
  res._chunks = [] as Buffer[];
  res._byteLength = 0;
  res._truncated = false;
  res._finished = false;
  res.headersSent = false;
  res.app = expressApp;

  res.setHeader = (name: string, value: any) => {
    res._headers[name.toLowerCase()] = String(value);
    return res;
  };
  res.getHeader = (name: string) => res._headers[name.toLowerCase()];
  res.removeHeader = (name: string) => { delete res._headers[name.toLowerCase()]; };
  res.getHeaders = () => ({ ...res._headers });

  res.status = (code: number) => { res.statusCode = code; return res; };
  res.type = (t: string) => { res.setHeader("content-type", t); return res; };

  res.set = res.header = function (field: any, value?: any) {
    if (typeof field === "object") {
      for (const [k, v] of Object.entries(field)) res.setHeader(k, v);
    } else {
      res.setHeader(field, value);
    }
    return res;
  };

  const appendChunk = (chunk: any) => {
    if (chunk === undefined || chunk === null) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    const remaining = MAX_BODY_BYTES - res._byteLength;
    if (remaining <= 0) { res._truncated = true; return; }
    if (buf.length > remaining) {
      res._chunks.push(buf.subarray(0, remaining));
      res._byteLength = MAX_BODY_BYTES;
      res._truncated = true;
    } else {
      res._chunks.push(buf);
      res._byteLength += buf.length;
    }
  };

  res.write = (chunk: any) => { appendChunk(chunk); return true; };

  res.end = (chunk?: any) => {
    if (chunk !== undefined) appendChunk(chunk);
    if (res._finished) return res;
    res._finished = true;
    res.headersSent = true;
    res.emit("finish");
    return res;
  };

  res.send = (body: any) => {
    if (body === undefined || body === null) return res.end();
    if (Buffer.isBuffer(body)) return res.end(body);
    if (typeof body === "string") return res.end(body);
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(body));
  };

  res.json = (body: any) => {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(body));
  };

  res.sendStatus = (code: number) => {
    res.statusCode = code;
    return res.end(String(code));
  };

  res.location = (loc: string) => { res.setHeader("location", loc); return res; };
  res.redirect = (codeOrLoc: any, loc?: string) => {
    if (typeof codeOrLoc === "number") {
      res.statusCode = codeOrLoc;
      res.setHeader("location", loc);
    } else {
      res.statusCode = 302;
      res.setHeader("location", codeOrLoc);
    }
    return res.end();
  };

  res._parsedBody = () => {
    if (res._chunks.length === 0) return null;
    const raw = Buffer.concat(res._chunks).toString("utf8");
    const ct = (res._headers["content-type"] || "").toLowerCase();
    if (ct.includes("application/json")) {
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return raw;
  };

  return res;
}
