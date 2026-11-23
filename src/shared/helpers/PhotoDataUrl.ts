// Photos arrive as base64 data URLs; these checks cap the decoded size and the image type.
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export class PhotoDataUrl {
  static isAcceptable(dataUrl: unknown, pngOnly = false): boolean {
    if (typeof dataUrl !== "string") return false;
    const match = (pngOnly ? /^data:image\/(png);base64,/ : /^data:image\/(png|jpeg|jpg|webp);base64,/i).exec(dataUrl);
    if (!match) return false;
    if ((dataUrl.length - match[0].length) * 0.75 > MAX_PHOTO_BYTES) return false;
    // The bytes are stored and served as an image, so they must start like the image type the URL names.
    const head = Buffer.from(dataUrl.slice(match[0].length, match[0].length + 16), "base64");
    return this.hasSignature(match[1].toLowerCase(), head);
  }

  private static hasSignature(type: string, head: Buffer): boolean {
    if (type === "png") return head.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    if (type === "jpeg" || type === "jpg") return head.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
    return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP";
  }
}
