import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently deletes the signed-in user's account and all data they own.
 * Owned rows cascade or are removed explicitly before the auth user is dropped.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Remove content owned by this user (RLS-bypassing admin client, scoped to uid).
    await supabaseAdmin.from("borrow_requests").delete().eq("requester_id", uid);
    await supabaseAdmin.from("poll_votes").delete().eq("voter_id", uid);
    await supabaseAdmin.from("poll_options").delete().in(
      "poll_id",
      ((await supabaseAdmin.from("polls").select("id").eq("created_by", uid)).data ?? []).map((p) => p.id),
    );
    await supabaseAdmin.from("polls").delete().eq("created_by", uid);
    await supabaseAdmin.from("project_messages").delete().eq("sender_id", uid);
    await supabaseAdmin.from("project_members").delete().eq("user_id", uid);
    await supabaseAdmin.from("projects").delete().eq("owner_id", uid);
    await supabaseAdmin.from("marketplace_items").delete().eq("seller_id", uid);
    await supabaseAdmin.from("lost_found_items").delete().eq("reporter_id", uid);
    await supabaseAdmin.from("notes").delete().eq("uploader_id", uid);
    await supabaseAdmin.from("events").delete().eq("created_by", uid);
    await supabaseAdmin.from("clubs").delete().eq("created_by", uid);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("profiles").delete().eq("id", uid);

    // Uploaded files live under a folder named after the user id.
    const { data: files } = await supabaseAdmin.storage.from("campus-uploads").list(uid, { limit: 1000 });
    if (files?.length) {
      const nested = await Promise.all(
        files.map(async (f) => {
          if (f.id) return [`${uid}/${f.name}`];
          const { data: inner } = await supabaseAdmin.storage
            .from("campus-uploads")
            .list(`${uid}/${f.name}`, { limit: 1000 });
          return (inner ?? []).map((i) => `${uid}/${f.name}/${i.name}`);
        }),
      );
      const paths = nested.flat();
      if (paths.length) await supabaseAdmin.storage.from("campus-uploads").remove(paths);
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
