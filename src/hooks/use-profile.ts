import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, sessionKey } from "@/lib/session";
import { profileApi } from "@/lib/data/profile";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_image_id: string | null;
  email: string | null;
  mode: "guest" | "signed_in";
  avatar_cloud_path: string | null;
  avatar_source: "cloud" | "local" | "none";
};

export function useProfile() {
  const qc = useQueryClient();
  const session = useSession();
  const queryKey = [...sessionKey(session), "profile", "me"] as const;
  const query = useQuery({
    queryKey,
    enabled: session.mode !== "none",
    queryFn: async (): Promise<Profile | null> => {
      const p = await profileApi.get(session);
      if (!p) return null;
      return {
        id: p.id,
        email: p.email,
        display_name: p.displayName,
        avatar_url: p.avatarUrl,
        avatar_image_id: p.avatarImageId,
        mode: p.mode,
        avatar_cloud_path: p.avatarCloudPath,
        avatar_source: p.avatarSource,
      };
    },
  });

  useEffect(() => {
    if (session.mode !== "signed_in") return;
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      qc.invalidateQueries({
        predicate: ({ queryKey }) => queryKey[2] === "profile" && queryKey[3] === "me",
      });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc, session.mode]);

  return query;
}