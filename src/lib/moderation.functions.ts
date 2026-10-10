import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  texts: z.array(z.string().max(5000)).max(20),
  file: z
    .object({
      name: z.string().max(300),
      mime: z.string().max(100),
      base64: z.string().max(14_000_000),
    })
    .nullable(),
});

const SYSTEM = `You are a content safety moderator for a university student portal (notes, marketplace, lost & found, profiles, chats).
Reject content that contains: sexual/nudity/18+ material, pornography, graphic violence or gore, hate speech, harassment or threats, illegal drugs or weapons sales, self-harm promotion, or obvious scams.
Allow normal academic material, everyday items for sale, personal photos, casual conversation.
Respond with JSON: {"allowed": boolean, "reason": short student-friendly reason (empty if allowed)}.`;

export const moderateContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { allowed: false, reason: "Safety check is not configured." };

    const texts = data.texts.map((t) => t.trim()).filter(Boolean);
    const content: Record<string, unknown>[] = [
      { type: "input_text", text: texts.length ? `Text to review:\n${texts.join("\n---\n")}` : "No text." },
    ];
    if (data.file) {
      const url = `data:${data.file.mime};base64,${data.file.base64}`;
      if (data.file.mime.startsWith("image/")) content.push({ type: "input_image", image_url: url });
      else if (data.file.mime === "application/pdf")
        content.push({ type: "input_file", filename: data.file.name, file_data: url });
    }
    if (!texts.length && content.length === 1) return { allowed: true, reason: "" };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: SYSTEM,
        input: [{ role: "user", content }],
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "moderation",
            strict: true,
            schema: {
              type: "object",
              properties: { allowed: { type: "boolean" }, reason: { type: "string" } },
              required: ["allowed", "reason"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!res.ok || !res.body) {
      if (res.status === 402) return { allowed: false, reason: "AI safety check is out of credits. Please try later." };
      if (res.status === 429) return { allowed: false, reason: "Too many checks right now. Try again in a moment." };
      console.error("moderation error", res.status, await res.text().catch(() => ""));
      return { allowed: false, reason: "Safety check failed. Please try again." };
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let out = "";
    let refused = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
          if (ev.type === "response.refusal.delta") refused = true;
        } catch {
          /* partial */
        }
      }
    }
    if (refused) return { allowed: false, reason: "This content isn't allowed on Campus Hub." };
    try {
      const parsed = JSON.parse(out) as { allowed: boolean; reason: string };
      return { allowed: !!parsed.allowed, reason: parsed.reason || "" };
    } catch {
      return { allowed: false, reason: "Safety check failed. Please try again." };
    }
  });
