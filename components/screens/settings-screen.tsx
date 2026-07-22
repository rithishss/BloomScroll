"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { LogOut, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { useDataProvider } from "@/lib/data/provider-context";
import {
  DIFFICULTY_LABELS,
  STUDY_GOAL_LABELS,
  type Difficulty,
  type Profile,
  type StudyGoal,
  type TopicPreference,
} from "@/lib/types";

interface ProfileForm {
  displayName: string;
  studyGoal: StudyGoal;
  preferredDifficulty: Difficulty;
}

export function SettingsScreen({ basePath }: { basePath: string }) {
  const provider = useDataProvider();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [topics, setTopics] = useState<TopicPreference[] | null>(null);
  const [newTopic, setNewTopic] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const isDemo = provider.mode === "demo";

  const form = useForm<ProfileForm>({
    defaultValues: { displayName: "", studyGoal: "understand", preferredDifficulty: "core" },
  });
  const studyGoal = useWatch({ control: form.control, name: "studyGoal" });
  const preferredDifficulty = useWatch({ control: form.control, name: "preferredDifficulty" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([provider.getProfile(), provider.getTopicPreferences()])
      .then(([p, t]) => {
        if (cancelled) return;
        setProfile(p);
        setTopics(t);
        form.reset({
          displayName: p.displayName,
          studyGoal: p.studyGoal,
          preferredDifficulty: p.preferredDifficulty,
        });
      })
      .catch(() => toast.error("Settings could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [provider, form]);

  const saveProfile = form.handleSubmit(async (values) => {
    try {
      const updated = await provider.updateProfile(values);
      setProfile(updated);
      toast.success("Profile saved");
    } catch {
      toast.error("Profile changes didn't save.");
    }
  });

  const updateTopicWeight = async (topic: string, weight: number) => {
    setTopics(
      (prev) =>
        prev?.map((t) => (t.topic === topic ? { ...t, explicitWeight: weight } : t)) ?? null,
    );
    try {
      await provider.setTopicPreference(topic, weight);
    } catch {
      toast.error("Topic weight didn't save.");
    }
  };

  const addTopic = async () => {
    const topic = newTopic.trim();
    if (!topic) return;
    if (topics?.some((t) => t.topic.toLowerCase() === topic.toLowerCase())) {
      toast.info("That topic is already in your interests.");
      return;
    }
    try {
      await provider.setTopicPreference(topic, 0.7);
      setTopics(await provider.getTopicPreferences());
      setNewTopic("");
    } catch {
      toast.error("The topic couldn't be added.");
    }
  };

  const removeTopic = async (topic: string) => {
    try {
      await provider.removeTopicPreference(topic);
      setTopics((prev) => prev?.filter((t) => t.topic !== topic) ?? null);
    } catch {
      toast.error("The topic couldn't be removed.");
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await provider.deleteAllData();
      toast.success(isDemo ? "Demo workspace reset" : "All data deleted");
      setConfirmReset(false);
      router.push(`${basePath}/feed`);
      router.refresh();
    } catch {
      toast.error("The reset failed. Please try again.");
    } finally {
      setResetting(false);
    }
  };

  const handleSignOut = async () => {
    await provider.signOut();
    router.push(isDemo ? "/" : "/login");
    router.refresh();
  };

  if (!profile || !topics) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <h1 className="font-display text-2xl font-semibold">Settings</h1>

      <form
        onSubmit={saveProfile}
        className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft"
      >
        <h2 className="font-display text-lg font-semibold">Profile & study style</h2>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              {...form.register("displayName", { required: true, maxLength: 60 })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="studyGoal">Study goal</Label>
            <Select
              value={studyGoal}
              onValueChange={(v) =>
                form.setValue("studyGoal", v as StudyGoal, { shouldDirty: true })
              }
            >
              <SelectTrigger id="studyGoal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STUDY_GOAL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="preferredDifficulty">Preferred difficulty</Label>
            <Select
              value={preferredDifficulty}
              onValueChange={(v) =>
                form.setValue("preferredDifficulty", v as Difficulty, { shouldDirty: true })
              }
            >
              <SelectTrigger id="preferredDifficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" className="mt-5" disabled={form.formState.isSubmitting}>
          Save profile
        </Button>
      </form>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-lg font-semibold">Topic interests</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Higher weight means those topics surface more often. Bloom also learns quietly from what
          you save and linger on.
        </p>
        <ul className="mt-4 space-y-4">
          {topics.map((t) => (
            <li key={t.topic} className="flex items-center gap-3">
              <div className="w-40 min-w-0">
                <p className="truncate text-sm font-medium">{t.topic}</p>
                <p className="text-xs text-muted-foreground">
                  learned +{Math.round(t.learnedWeight * 100)}%
                </p>
              </div>
              <Slider
                value={[Math.round(t.explicitWeight * 100)]}
                onValueChange={([v]) => updateTopicWeight(t.topic, v / 100)}
                max={100}
                step={5}
                className="flex-1"
                aria-label={`Interest weight for ${t.topic}`}
              />
              <span className="w-9 text-right text-xs text-muted-foreground">
                {Math.round(t.explicitWeight * 100)}%
              </span>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={`Remove ${t.topic}`}
                onClick={() => removeTopic(t.topic)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addTopic();
          }}
        >
          <Input
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="Add a topic, e.g. Fourier Analysis"
            aria-label="New topic"
            maxLength={60}
          />
          <Button type="submit" variant="outline" disabled={!newTopic.trim()}>
            <Plus aria-hidden /> Add
          </Button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-lg font-semibold">Appearance</h2>
        <div className="mt-4 grid gap-1.5">
          <Label htmlFor="theme">Theme</Label>
          <Select value={theme ?? "system"} onValueChange={setTheme}>
            <SelectTrigger id="theme" className="max-w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Swipe animations automatically respect your system&apos;s reduced-motion preference.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-destructive/30 bg-card p-6 shadow-soft">
        <h2 className="font-display text-lg font-semibold text-destructive">Data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isDemo
            ? "Reset the demo workspace to its original seeded state. Your interactions live only in this browser."
            : "Delete all your documents, cards, and study history. This cannot be undone."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="destructive" onClick={() => setConfirmReset(true)}>
            {isDemo ? "Reset demo workspace" : "Delete all my data"}
          </Button>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut aria-hidden /> {isDemo ? "Exit demo" : "Sign out"}
          </Button>
        </div>
      </section>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isDemo ? "Reset the demo workspace?" : "Delete everything?"}</DialogTitle>
            <DialogDescription>
              {isDemo
                ? "Saved cards, mastery, and demo uploads in this browser will be cleared and the seeded content restored."
                : "All documents, generated cards, study history, and files will be permanently removed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              {resetting ? "Working…" : isDemo ? "Reset workspace" : "Delete everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
