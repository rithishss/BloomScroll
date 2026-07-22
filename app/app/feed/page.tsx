import { redirect } from "next/navigation";
import { FeedScreen } from "@/components/screens/feed-screen";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppFeedPage() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (profile && !profile.onboarding_completed) {
        redirect("/app/onboarding");
      }
    }
  }
  return <FeedScreen basePath="/app" />;
}
