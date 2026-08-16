export function isPublicFile(file: { contentType?: string } | null | undefined): boolean {
  return file?.contentType === "website";
}

export function isPublicDiskFilePath(urlPath: string): boolean {
  const raw = (urlPath || "").split("?")[0];
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { return false; }
  if (decoded.includes("..")) return false;
  const parts = decoded.split("/").filter(Boolean);
  if (parts[0] === "content") parts.shift();
  if (parts.length === 3 && parts[1] === "files") return true;
  if (parts.length === 5 && parts[1] === "files" && parts[2] === "website") return true;
  return false;
}
