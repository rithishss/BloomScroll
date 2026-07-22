"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface AuthFormValues {
  displayName: string;
  email: string;
  password: string;
}

/** Shared login/signup form. When Supabase isn't configured, it degrades to
 * an honest setup notice with a demo link instead of dead controls. */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createSupabaseBrowserClient();

  const form = useForm<AuthFormValues>({
    defaultValues: { displayName: "", email: "", password: "" },
  });

  if (!supabase) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <h1 className="font-display text-xl font-semibold">Real mode isn&apos;t configured</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This deployment has no Supabase credentials, so accounts are unavailable. The full
          experience is explorable in the demo workspace — or see the README to connect Supabase and
          OpenAI.
        </p>
        <Button asChild className="mt-5">
          <Link href="/demo">Open the demo</Link>
        </Button>
      </div>
    );
  }

  if (emailSent) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <MailCheck className="mx-auto size-10 text-leaf" aria-hidden />
        <h1 className="font-display mt-4 text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          We sent a confirmation link to <strong>{form.getValues("email")}</strong>. Click it to
          activate your account, then sign in.
        </p>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: { display_name: values.displayName.trim() || "Student" },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/feed`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setEmailSent(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
      }
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/app") ? next : "/app/feed");
      router.refresh();
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card">
      <h1 className="font-display text-2xl font-semibold">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {mode === "login"
          ? "Sign in to continue studying."
          : "A minute from now, your notes could be a feed."}
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        {mode === "signup" && (
          <div className="grid gap-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              autoComplete="name"
              maxLength={60}
              {...form.register("displayName", { required: "Please enter a name" })}
            />
            {form.formState.errors.displayName && (
              <p role="alert" className="text-xs text-destructive">
                {form.formState.errors.displayName.message}
              </p>
            )}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...form.register("email", {
              required: "Please enter your email",
              pattern: { value: /.+@.+\..+/, message: "That doesn't look like an email" },
            })}
          />
          {form.formState.errors.email && (
            <p role="alert" className="text-xs text-destructive">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            {...form.register("password", {
              required: "Please enter a password",
              minLength: { value: 8, message: "At least 8 characters" },
            })}
          />
          {form.formState.errors.password && (
            <p role="alert" className="text-xs text-destructive">
              {form.formState.errors.password.message}
            </p>
          )}
        </div>

        {serverError && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="mt-1">
          {submitting ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link
              href="/signup"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
