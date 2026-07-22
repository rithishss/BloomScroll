import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/bloomscroll/wordmark";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RealProviders } from "@/app/app/real-providers";

/**
 * Server-side gate for the real app: not-configured → setup notice,
 * signed-out → /login (defense in depth alongside the proxy). Onboarding
 * redirects live in the pages via profile checks; the shell is shared with
 * demo mode through RealProviders.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="bloom-aurora flex min-h-dvh flex-col items-center justify-center px-4 text-center">
        <Wordmark />
        <h1 className="font-display mt-6 text-2xl font-semibold">
          Real mode isn&apos;t configured
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          This deployment has no Supabase credentials, so the authenticated app is unavailable.
          Everything is explorable in the demo workspace — or follow the README to connect Supabase
          and OpenAI.
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild>
            <Link href="/demo">Open the demo</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return <RealProviders>{children}</RealProviders>;
}
