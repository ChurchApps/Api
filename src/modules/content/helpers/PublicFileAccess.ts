// Arrangement audio is served straight into an <audio> element, which never sends the JWT.
// It is already stored public-read on the default tier and shared "anyone: reader" by the BYOS providers.
const PUBLIC_CONTENT_TYPES = ["website", "arrangement"];

export function isPublicFile(file: { contentType?: string } | null | undefined): boolean {
  return PUBLIC_CONTENT_TYPES.includes(file?.contentType || "");
}

export function isPublicDiskFilePath(urlPath: string): boolean {
  const raw = (urlPath || "").split("?")[0];
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { return false; }
  if (decoded.includes("..")) return false;
  const parts = decoded.split("/").filter(Boolean);
  if (parts[0] === "content") parts.shift();
  if (parts.length === 3 && parts[1] === "files") return true;
  if (parts.length === 5 && parts[1] === "files" && PUBLIC_CONTENT_TYPES.includes(parts[2])) return true;
  return false;
}
