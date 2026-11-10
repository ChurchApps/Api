// Arrangement audio is served straight into an <audio> element, which never sends the JWT.
// It is already stored public-read on the default tier and shared "anyone: reader" by the BYOS providers.
const PUBLIC_CONTENT_TYPES = ["website", "arrangement"];
// Image folders the Api writes under a church id (person photos, logos and user images,
// sermon and playlist thumbnails, gallery uploads). They are public-read on S3 as well.
const PUBLIC_CHURCH_FOLDERS = ["membership", "settings", "streamingLive", "gallery"];

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
  // The commons library is a public catalog; only its pending (unreviewed) submissions stay private.
  if (parts[0] === "commons") return parts.length > 1 && parts[1] !== "pending";
  if (parts[0] === "stockPhotos") return parts.length > 1;
  if (parts.length >= 3 && PUBLIC_CHURCH_FOLDERS.includes(parts[1])) return true;
  if (parts.length === 3 && parts[1] === "files") return true;
  if (parts.length === 5 && parts[1] === "files" && PUBLIC_CONTENT_TYPES.includes(parts[2])) return true;
  return false;
}
