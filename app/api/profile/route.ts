import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { apiError, apiErrorFromException } from "@/lib/api/errors";
import { mapProfile } from "@/lib/database/mappers";
import { profilePatchSchema } from "@/lib/validation/api";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { data, error } = await auth.supabase
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return apiError("not_found", "Profile not found.");
    return NextResponse.json({ profile: mapProfile(data, auth.user.email ?? null) });
  } catch (err) {
    return apiErrorFromException(err);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const patch = profilePatchSchema.parse(await request.json());
    const { data, error } = await auth.supabase
      .from("profiles")
      .update({
        ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
        ...(patch.studyGoal !== undefined ? { study_goal: patch.studyGoal } : {}),
        ...(patch.preferredDifficulty !== undefined
          ? { preferred_difficulty: patch.preferredDifficulty }
          : {}),
        ...(patch.onboardingCompleted !== undefined
          ? { onboarding_completed: patch.onboardingCompleted }
          : {}),
      })
      .eq("id", auth.user.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return apiError("not_found", "Profile not found.");
    return NextResponse.json({ profile: mapProfile(data, auth.user.email ?? null) });
  } catch (err) {
    return apiErrorFromException(err);
  }
}
