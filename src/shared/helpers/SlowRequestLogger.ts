import express from "express";

const DEFAULT_SLOW_MS = 1000;

export const slowRequestThreshold = () => {
  const ms = parseInt(process.env.SLOW_REQUEST_MS || "", 10);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_SLOW_MS;
};

// Route pattern only (e.g. /membership/people/:id) - never the concrete URL, query, user or church.
export const routePattern = (req: express.Request) => {
  const path = req.route?.path;
  if (!path) return "<unmatched>";
  return (req.baseUrl || "") + String(path);
};

// Logs one `SLOW <METHOD> <route pattern> <status> <ms>ms` line when a request runs past SLOW_REQUEST_MS.
export const slowRequestLogger = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    if (ms < slowRequestThreshold()) return;
    console.log(`SLOW ${req.method} ${routePattern(req)} ${res.statusCode} ${ms}ms`);
  });
  next();
};
