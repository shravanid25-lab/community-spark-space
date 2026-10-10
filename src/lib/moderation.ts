import { moderateContent } from "@/lib/moderation.functions";

const MAX_AI_FILE = 10 * 1024 * 1024;

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** AI safety check. Throws an Error with a friendly message if the content is rejected. */
export async function aiModerate(texts: unknown[], file?: File | null) {
  const strs = texts.flat().filter((t): t is string => typeof t === "string" && !!t.trim());
  let filePayload: { name: string; mime: string; base64: string } | null = null;
  if (file && file.size > 0) {
    const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
    if ((mime.startsWith("image/") || mime === "application/pdf") && file.size <= MAX_AI_FILE) {
      filePayload = { name: file.name, mime, base64: await toBase64(file) };
    }
  }
  if (!strs.length && !filePayload) return;
  const res = await moderateContent({ data: { texts: strs, file: filePayload } });
  if (!res.allowed) throw new Error(`Rejected by AI safety check: ${res.reason || "content not allowed"}`);
}

/** Toast-based variant for form handlers: returns false (and shows why) if rejected. */
export async function aiOk(texts: unknown[], file?: File | null): Promise<boolean> {
  const { toast } = await import("sonner");
  const id = toast.loading("Checking content…");
  try {
    await aiModerate(texts, file);
    toast.dismiss(id);
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Safety check failed", { id });
    return false;
  }
}
