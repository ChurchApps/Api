import { PhotoDataUrl } from "../PhotoDataUrl.js";

const dataUrl = (type: string, bytes: Buffer) => "data:image/" + type + ";base64," + bytes.toString("base64");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const JPEG = Buffer.from("ffd8ffe000104a464946", "hex");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from("24000000", "hex"), Buffer.from("WEBPVP8 ")]);

describe("PhotoDataUrl.isAcceptable", () => {
  it("accepts real png, jpeg and webp bytes", () => {
    expect(PhotoDataUrl.isAcceptable(dataUrl("png", PNG), true)).toBe(true);
    expect(PhotoDataUrl.isAcceptable(dataUrl("png", PNG))).toBe(true);
    expect(PhotoDataUrl.isAcceptable(dataUrl("jpeg", JPEG))).toBe(true);
    expect(PhotoDataUrl.isAcceptable(dataUrl("JPG", JPEG))).toBe(true);
    expect(PhotoDataUrl.isAcceptable(dataUrl("webp", WEBP))).toBe(true);
  });

  it("refuses bytes that are not the image type the data url names", () => {
    expect(PhotoDataUrl.isAcceptable(dataUrl("png", Buffer.from("<html><script>x</script></html>")), true)).toBe(false);
    expect(PhotoDataUrl.isAcceptable(dataUrl("png", Buffer.from("PK\u0003\u0004 zip archive bytes")))).toBe(false);
    expect(PhotoDataUrl.isAcceptable(dataUrl("jpeg", PNG))).toBe(false);
    expect(PhotoDataUrl.isAcceptable(dataUrl("webp", JPEG))).toBe(false);
    expect(PhotoDataUrl.isAcceptable("data:image/png;base64,", true)).toBe(false);
  });

  it("keeps the type and size limits", () => {
    expect(PhotoDataUrl.isAcceptable(dataUrl("jpeg", JPEG), true)).toBe(false);
    expect(PhotoDataUrl.isAcceptable("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(PhotoDataUrl.isAcceptable(undefined)).toBe(false);
    const huge = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    expect(PhotoDataUrl.isAcceptable(dataUrl("png", huge), true)).toBe(false);
  });
});
