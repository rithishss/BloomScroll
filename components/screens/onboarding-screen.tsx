"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { BloomMark } from "@/components/bloomscroll/bloom-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDataProvider } from "@/lib/data/provider-context";
import { DIFFICULTY_LABELS, STUDY_GOAL_LABELS, type Difficulty, type StudyGoal } from "@/lib/types";
import { cn } from "@/lib/utils";

const SUGGESTED_TOPICS = [
  "Operating Systems",
  "Signals & Systems",
  "Data Structures",
  "Computer Networks",
  "Linear Algebra",
  "Probability",
  "Machine Learning",
  "Databases",
];

interface OnboardingForm {
  displayName: string;
}

/** Three-step onboarding: name → interests → goal + difficulty. */
export function OnboardingScreen({ basePath }: { basePath: string }) {
  const provider = useDataProvider();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [customTopic, setCustomTopic] = useState("");
  const [extraTopics, setExtraTopics] = useState<string[]>([]);
  const [goal, setGoal] = useState<StudyGoal>("understand");
  const [difficulty, setDifficulty] = useState<Difficulty>("core");
  const [saving, setSaving] = useState(false);

  const form = useForm<OnboardingForm>({ defaultValues: { displayName: "" } });

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const addCustomTopic = () => {
    const topic = customTopic.trim();
    if (!topic) return;
    if (
      ![...SUGGESTED_TOPICS, ...extraTopics].some((t) => t.toLowerCase() === topic.toLowerCase())
    ) {
      setExtraTopics((prev) => [...prev, topic]);
    }
    setSelectedTopics((prev) => new Set(prev).add(topic));
    setCustomTopic("");
  };

  const finish = async () => {
    setSaving(true);
    try {
      await provider.updateProfile({
        displayName: form.getValues("displayName").trim() || "Student",
        studyGoal: goal,
        preferredDifficulty: difficulty,
        onboardingCompleted: true,
      });
      await Promise.all(
        [...selectedTopics].map((topic) => provider.setTopicPreference(topic, 0.7)),
      );
      router.push(`${basePath}/feed`);
    } catch {
      toast.error("Onboarding could not be saved. Please try again.");
      setSaving(false);
    }
  };

  const allTopics = [...SUGGESTED_TOPICS, ...extraTopics];

  return (
    <div className="bloom-aurora flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-card">
        <div className="flex items-center gap-3">
          <BloomMark className="size-9 text-leaf" progress={(step + 1) / 3} />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Step {step + 1} of 3
            </p>
            <h1 className="font-display text-xl font-semibold">
              {step === 0
                ? "Welcome to BloomScroll"
                : step === 1
                  ? "What are you studying?"
                  : "How do you like to study?"}
            </h1>
          </div>
        </div>

        {step === 0 && (
          <form className="mt-6" onSubmit={form.handleSubmit(() => setStep(1))}>
            <div className="grid gap-1.5">
              <Label htmlFor="displayName">What should we call you?</Label>
              <Input
                id="displayName"
                placeholder="e.g. Priya"
                autoFocus
                maxLength={60}
                {...form.register("displayName", { required: "Please enter a name" })}
              />
              {form.formState.errors.displayName && (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.displayName.message}
                </p>
              )}
            </div>
            <Button type="submit" className="mt-6 w-full">
              Continue <ArrowRight aria-hidden />
            </Button>
          </form>
        )}

        {step === 1 && (
          <div className="mt-6">
            <p className="text-sm text-muted-foreground">
              Pick a few interests — your feed leans toward them from day one.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {allTopics.map((topic) => {
                const active = selectedTopics.has(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggleTopic(topic)}
                    aria-pressed={active}
                    className={cn(
                      "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-surface",
                    )}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addCustomTopic();
              }}
            >
              <Input
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Add your own…"
                aria-label="Add a custom topic"
                maxLength={60}
              />
              <Button type="submit" variant="outline" disabled={!customTopic.trim()}>
                Add
              </Button>
            </form>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>
                Continue <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6">
            <fieldset>
              <legend className="text-sm font-medium">Study goal</legend>
              <div className="mt-2 grid gap-2">
                {Object.entries(STUDY_GOAL_LABELS).map(([value, label]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
                      goal === value
                        ? "border-primary bg-surface"
                        : "border-border hover:bg-surface/60",
                    )}
                  >
                    <input
                      type="radio"
                      name="goal"
                      value={value}
                      checked={goal === value}
                      onChange={() => setGoal(value as StudyGoal)}
                      className="accent-(--forest)"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-5">
              <legend className="text-sm font-medium">Preferred difficulty</legend>
              <div className="mt-2 flex gap-2">
                {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDifficulty(value as Difficulty)}
                    aria-pressed={difficulty === value}
                    className={cn(
                      "flex-1 cursor-pointer rounded-xl border px-4 py-2.5 text-sm transition-colors",
                      difficulty === value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-surface",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>
                Back
              </Button>
              <Button onClick={finish} disabled={saving}>
                {saving ? "Planting…" : "Start studying"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
