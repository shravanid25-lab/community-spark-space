import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Resolves a signed URL for an avatar stored in the private campus-uploads bucket. */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["avatar-url", path],
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage.from("campus-uploads").createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  });
}
