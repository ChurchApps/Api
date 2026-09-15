export function statusFromError(error: unknown): number {
  const e = error as { statusCode?: number; status?: number; response?: { status?: number }; message?: string };
  const raw = e?.statusCode ?? e?.status ?? e?.response?.status;
  const status = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(status) && status >= 400 && status < 600) return status;
  return 500;
}
