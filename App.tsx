import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./src/lib/supabase";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  target_language: string;
  cefr_level: string;
  placement_level: string;
  daily_goal_minutes: number;
  onboarding_completed: boolean;
  streak_days: number;
  total_xp: number;
};

type SkillKey = "Reading" | "Writing" | "Listening" | "Speaking";

type Skill = {
  key: SkillKey;
  value: number;
  tone: string;
};

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  cefr_level: string;
  topic: string;
  estimated_minutes: number;
  sort_order: number;
};

type SrsCard = {
  id: string;
  prompt: string;
  answer: string;
  srs_stage: number;
  due_at: string;
  last_reviewed_at: string | null;
};

type LessonQuiz = {
  prompt: string;
  options: string[];
  correctIndex: number;
  hint: string;
};

type LessonResult = {
  lesson: Lesson;
  correct: boolean;
  xpEarned: number;
  accuracy: number;
};

type Achievement = {
  title: string;
  description: string;
  unlocked: boolean;
};

type AuthMode = "sign-in" | "sign-up";
type Screen = "auth" | "onboarding" | "dashboard" | "lesson" | "review" | "summary";
type NavTab = "dashboard" | "lessons" | "review" | "journal" | "progress";
type JournalSort = "newest" | "oldest";
type JournalTag = "all" | "grammar" | "vocabulary" | "speaking" | "listening" | "review";
type LessonFilter = "all" | "grammar" | "vocabulary" | "listening" | "speaking";

const skills: Skill[] = [
  { key: "Reading", value: 68, tone: "#4C7DFF" },
  { key: "Writing", value: 54, tone: "#F4A261" },
  { key: "Listening", value: 61, tone: "#2A9D8F" },
  { key: "Speaking", value: 47, tone: "#E76F51" },
];

const lessonSteps = [
  "Warm-up vocab set: food and cafes",
  "Grammar focus: accusative articles",
  "Listening check: a short order at a bakery",
  "Speaking prompt: introduce yourself politely",
];

const placementChoices = ["A1", "A2", "B1", "B2"] as const;

const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const lessonFilters: Array<{ key: LessonFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "grammar", label: "Grammar" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "listening", label: "Listening" },
  { key: "speaking", label: "Speaking" },
];

function getLessonFilter(lesson: Lesson): LessonFilter {
  const text = `${lesson.title} ${lesson.description ?? ""} ${lesson.topic}`.toLowerCase();

  if (text.includes("grammar") || text.includes("accusative") || text.includes("article")) {
    return "grammar";
  }

  if (text.includes("listen") || text.includes("audio") || text.includes("dialogue")) {
    return "listening";
  }

  if (text.includes("speak") || text.includes("pronunciation") || text.includes("conversation")) {
    return "speaking";
  }

  if (text.includes("vocab") || text.includes("word") || text.includes("shopping") || text.includes("greeting") || text.includes("order")) {
    return "vocabulary";
  }

  return "grammar";
}

function getWeekStart(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function buildWeeklyActivity(
  sessions: Array<{ created_at: string; duration_seconds: number }>
) {
  const today = new Date();
  const weekStart = getWeekStart(today);
  const activity = weekLabels.map((label, index) => ({
    label,
    value: 0,
    minutes: 0,
    isoDate: new Date(weekStart.getTime() + index * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  }));

  sessions.forEach((session) => {
    const dateKey = new Date(session.created_at).toISOString().slice(0, 10);
    const slot = activity.find((day) => day.isoDate === dateKey);
    if (slot) {
      slot.value += 1;
      slot.minutes += Math.max(1, Math.round(session.duration_seconds / 60));
    }
  });

  return activity;
}

function buildStreakTrack(
  sessions: Array<{ created_at: string }>,
  days = 14
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const seen = new Set(sessions.map((session) => new Date(session.created_at).toISOString().slice(0, 10)));

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const key = date.toISOString().slice(0, 10);

    return {
      key,
      label: date.getDate().toString(),
      active: seen.has(key),
      isToday: key === today.toISOString().slice(0, 10),
    };
  });
}

function buildLessonQuiz(lesson: Lesson): LessonQuiz {
  const topic = `${lesson.title} ${lesson.topic}`.toLowerCase();

  if (topic.includes("accusative")) {
    return {
      prompt: "Which article fits 'I buy the bread'?",
      options: ["den Brot", "die Brot", "das Brot"],
      correctIndex: 0,
      hint: "Brot is neuter, but the accusative article matters here.",
    };
  }

  if (topic.includes("greeting") || topic.includes("order")) {
    return {
      prompt: "Which phrase is the most polite way to start a cafe order?",
      options: ["Ich will Kaffee", "Guten Tag, ich hätte gern Kaffee", "Kaffee jetzt"],
      correctIndex: 1,
      hint: "Polite requests usually sound softer and more formal.",
    };
  }

  return {
    prompt: "Which response best matches a short German practice dialogue?",
    options: ["Ja, gerne", "Nein, niemals", "Vielleicht später"],
    correctIndex: 0,
    hint: "For a friendly practice exchange, a simple affirmative answer fits best.",
  };
}

function buildLessonQuizAscii(lesson: Lesson): LessonQuiz {
  const topic = `${lesson.title} ${lesson.topic}`.toLowerCase();

  if (topic.includes("accusative")) {
    return {
      prompt: "Which article fits 'I buy the bread'?",
      options: ["den Brot", "die Brot", "das Brot"],
      correctIndex: 0,
      hint: "Brot is neuter, but the accusative article matters here.",
    };
  }

  if (topic.includes("greeting") || topic.includes("order")) {
    return {
      prompt: "Which phrase is the most polite way to start a cafe order?",
      options: ["Ich will Kaffee", "Guten Tag, ich haette gern Kaffee", "Kaffee jetzt"],
      correctIndex: 1,
      hint: "Polite requests usually sound softer and more formal.",
    };
  }

  return {
    prompt: "Which response best matches a short German practice dialogue?",
    options: ["Ja, gerne", "Nein, niemals", "Vielleicht spaeter"],
    correctIndex: 0,
    hint: "For a friendly practice exchange, a simple affirmative answer fits best.",
  };
}

function buildSrsCardHint(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("article")) {
    return "Focus on the grammatical role first, then match the article.";
  }

  if (lower.includes("order") || lower.includes("cafe")) {
    return "Keep the sentence polite and short.";
  }

  return "Recall the card, then check whether the meaning still feels natural.";
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<(typeof placementChoices)[number]>("A1");
  const [displayName, setDisplayName] = useState("");
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState("10");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>("all");
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [selectedQuizAnswer, setSelectedQuizAnswer] = useState<number | null>(
    null
  );
  const [lessonNote, setLessonNote] = useState("");
  const [lessonSaving, setLessonSaving] = useState(false);
  const [lessonResult, setLessonResult] = useState<LessonResult | null>(null);
  const [lessonHistoryQuery, setLessonHistoryQuery] = useState("");
  const [lessonHistory, setLessonHistory] = useState<
    Array<{
      id: string;
      created_at: string;
      accuracy: number | null;
      hint_usage: number;
      note: string | null;
      pinned: boolean;
    }>
  >([]);
  const [lessonHistoryLoading, setLessonHistoryLoading] = useState(false);
  const [lessonHistoryError, setLessonHistoryError] = useState<string | null>(
    null
  );
  const [srsCards, setSrsCards] = useState<SrsCard[]>([]);
  const [srsLoading, setSrsLoading] = useState(false);
  const [srsError, setSrsError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<
    Array<{
      id: string;
      created_at: string;
      lesson_id: string | null;
      duration_seconds: number;
      accuracy: number | null;
      hint_usage: number;
      note: string | null;
      pinned: boolean;
    }>
  >([]);
  const [recentSessionsLoading, setRecentSessionsLoading] = useState(false);
  const [recentSessionsError, setRecentSessionsError] = useState<string | null>(
    null
  );
  const [activeReviewIndex, setActiveReviewIndex] = useState<number | null>(
    null
  );
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editingReflectionId, setEditingReflectionId] = useState<string | null>(null);
  const [editingReflectionNote, setEditingReflectionNote] = useState("");
  const [editingReflectionSaving, setEditingReflectionSaving] = useState(false);
  const [reflectionQuery, setReflectionQuery] = useState("");
  const [journalQuery, setJournalQuery] = useState("");
  const [journalSort, setJournalSort] = useState<JournalSort>("newest");
  const [journalTag, setJournalTag] = useState<JournalTag>("all");
  const [journalPinnedOnly, setJournalPinnedOnly] = useState(false);
  const [mainTab, setMainTab] = useState<NavTab>("dashboard");
  const currentNavTab: NavTab = screen === "dashboard"
    ? mainTab
    : screen === "review"
      ? "review"
      : screen === "lesson"
        ? "lessons"
        : screen === "summary"
          ? mainTab
          : mainTab;
  const filteredLessons = useMemo(
    () =>
      lessonFilter === "all"
        ? lessons
        : lessons.filter((lesson) => getLessonFilter(lesson) === lessonFilter),
    [lessonFilter, lessons]
  );
  const lessonFilterCounts = useMemo(
    () =>
      lessonFilters.reduce(
        (counts, filter) => ({
          ...counts,
          [filter.key]:
            filter.key === "all"
              ? lessons.length
              : lessons.filter((lesson) => getLessonFilter(lesson) === filter.key).length,
        }),
        {} as Record<LessonFilter, number>
      ),
    [lessons]
  );
  const lessonProgress = useMemo(() => {
    const progress = new Map<
      string,
      {
        sessions: number;
        lastCompletedAt: string | null;
        accuracy: number | null;
        totalAccuracy: number;
      }
    >();

    recentSessions.forEach((entry) => {
      if (!entry.lesson_id) return;

      const current = progress.get(entry.lesson_id) ?? {
        sessions: 0,
        lastCompletedAt: null,
        accuracy: null,
        totalAccuracy: 0,
      };

      current.sessions += 1;
      current.totalAccuracy += entry.accuracy ?? 0;
      if (!current.lastCompletedAt || entry.created_at > current.lastCompletedAt) {
        current.lastCompletedAt = entry.created_at;
        current.accuracy = entry.accuracy;
      }

      progress.set(entry.lesson_id, current);
    });

    return progress;
  }, [recentSessions]);
  const weeklyActivity = useMemo(
    () => buildWeeklyActivity(recentSessions),
    [recentSessions]
  );
  const weeklyActiveDays = weeklyActivity.filter((day) => day.value > 0).length;
  const weeklyMinutes = weeklyActivity.reduce((sum, day) => sum + day.minutes, 0);
  const streakTrack = useMemo(
    () => buildStreakTrack(recentSessions),
    [recentSessions]
  );
  const streakRun = useMemo(() => {
    let streak = 0;
    for (let index = streakTrack.length - 1; index >= 0; index -= 1) {
      if (!streakTrack[index]?.active) break;
      streak += 1;
    }
    return streak;
  }, [streakTrack]);
  const achievementList = useMemo<Achievement[]>(
    () => [
      {
        title: "First lesson",
        description: "Complete your first German lesson.",
        unlocked: (profile?.total_xp ?? 0) > 0,
      },
      {
        title: "Three-day streak",
        description: "Show up on three different days.",
        unlocked: streakRun >= 3,
      },
      {
        title: "Review starter",
        description: "Work through your review queue at least once.",
        unlocked: recentSessions.some((entry) => entry.lesson_id === null),
      },
      {
        title: "Study regular",
        description: "Practice on five days in the last week.",
        unlocked: weeklyActiveDays >= 5,
      },
    ],
    [profile?.total_xp, recentSessions, streakRun, weeklyActiveDays]
  );
  const highlightedAchievement = useMemo(
    () => achievementList.find((achievement) => achievement.unlocked) ?? null,
    [achievementList]
  );
  const masteredLessonCount = useMemo(
    () =>
      Array.from(lessonProgress.values()).filter(
        (item) => item.sessions >= 3 && item.totalAccuracy / Math.max(1, item.sessions) >= 90
      ).length,
    [lessonProgress]
  );
  const strongestSkill = useMemo(
    () => skills.reduce((best, skill) => (skill.value > best.value ? skill : best), skills[0]),
    []
  );
  const weakestSkill = useMemo(
    () => skills.reduce((worst, skill) => (skill.value < worst.value ? skill : worst), skills[0]),
    []
  );
  const nextFocus = useMemo(() => {
    if (srsCards.length > 0) {
      return {
        title: "Clear today's review queue",
        description: `${srsCards.length} cards are due, so a short review will keep spacing on track.`,
      };
    }

    if (lessonProgress.size === 0) {
      return {
        title: "Start with the first lesson",
        description: "You have a clean slate, so a quick lesson is the fastest way to build momentum.",
      };
    }

    if (masteredLessonCount === 0) {
      return {
        title: `Revisit ${weakestSkill.key}`,
        description: `That is your lowest current skill, and it is a good candidate for the next practice block.`,
      };
    }

    return {
      title: `Stretch ${weakestSkill.key}`,
      description: "You already have a base, so another focused lesson can balance your current skill mix.",
    };
  }, [lessonProgress.size, masteredLessonCount, srsCards.length, weakestSkill.key]);
  const bestLessonAccuracy = useMemo(() => {
    let best = 0;
    lessonProgress.forEach((entry) => {
      const averageAccuracy = entry.totalAccuracy / Math.max(1, entry.sessions);
      if (averageAccuracy > best) best = averageAccuracy;
    });
    return Math.round(best);
  }, [lessonProgress]);
  const bestSessionAccuracy = useMemo(
    () =>
      Math.round(
        recentSessions.reduce((best, item) => Math.max(best, item.accuracy ?? 0), 0)
      ),
    [recentSessions]
  );
  const recentReflections = useMemo(
    () => {
      const query = reflectionQuery.trim().toLowerCase();
      return recentSessions
        .filter((item) => item.note?.trim())
        .filter((item) => {
          if (!query) return true;
          const lessonTitle = getLessonTitleById(item.lesson_id).toLowerCase();
          return (
            item.note?.toLowerCase().includes(query) ||
            lessonTitle.includes(query)
          );
        })
        .sort((left, right) => {
          const pinnedDiff = Number(right.pinned) - Number(left.pinned);
          if (pinnedDiff !== 0) return pinnedDiff;

          return (
            new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
          );
        })
        .slice(0, 3);
    },
    [recentSessions, reflectionQuery, lessons]
  );
  const journalEntries = useMemo(
    () => {
      const query = journalQuery.trim().toLowerCase();
      const matchesTag = (item: {
        lesson_id: string | null;
        note: string | null;
        pinned: boolean;
      }) => {
        if (journalPinnedOnly && !item.pinned) return false;
        if (journalTag === "all") return true;

        const lessonTitle = getLessonTitleById(item.lesson_id).toLowerCase();
        const noteText = item.note?.toLowerCase() ?? "";
        const combined = `${lessonTitle} ${noteText}`;

        if (journalTag === "review") {
          return item.lesson_id === null || combined.includes("review");
        }

        return combined.includes(journalTag);
      };

      const sortedEntries = [...recentSessions]
        .filter((item) => item.note?.trim())
        .filter(matchesTag)
        .filter((item) => {
          if (!query) return true;

          const lessonTitle = getLessonTitleById(item.lesson_id).toLowerCase();
          const noteText = item.note?.toLowerCase() ?? "";
          const dateText = new Date(item.created_at).toLocaleDateString().toLowerCase();

          return (
            noteText.includes(query) ||
            lessonTitle.includes(query) ||
            dateText.includes(query)
          );
        })
        .sort((left, right) => {
          const pinnedDiff = Number(right.pinned) - Number(left.pinned);
          if (pinnedDiff !== 0) return pinnedDiff;

          const leftTime = new Date(left.created_at).getTime();
          const rightTime = new Date(right.created_at).getTime();
          return journalSort === "newest" ? rightTime - leftTime : leftTime - rightTime;
        });

      return sortedEntries;
    },
    [recentSessions, journalQuery, journalSort, journalTag, journalPinnedOnly, lessons]
  );
  const filteredLessonHistory = useMemo(() => {
    const query = lessonHistoryQuery.trim().toLowerCase();
    if (!query) return lessonHistory;

    return lessonHistory.filter((item) => {
      const note = item.note?.toLowerCase() ?? "";
      return note.includes(query);
    });
  }, [lessonHistory, lessonHistoryQuery]);
  function getLessonProgressBadge(lessonId: string) {
    const entry = lessonProgress.get(lessonId);
    if (!entry) return { label: "New", tone: "new" as const };
    if (entry.sessions === 1) return { label: "In progress", tone: "progress" as const };
    return { label: "Practiced", tone: "done" as const };
  }

  function getLessonMasteryBadge(lessonId: string) {
    const entry = lessonProgress.get(lessonId);
    if (!entry) return { label: "New", tone: "new" as const };

    const averageAccuracy = entry.totalAccuracy / Math.max(1, entry.sessions);
    if (entry.sessions >= 3 && averageAccuracy >= 90) {
      return { label: "Mastered", tone: "done" as const };
    }
    if (entry.sessions >= 2 || averageAccuracy >= 75) {
      return { label: "Strong", tone: "progress" as const };
    }
    return { label: "Developing", tone: "new" as const };
  }

  function formatLastStudied(isoDate: string | null) {
    if (!isoDate) return "Not studied yet";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const studied = new Date(isoDate);
    studied.setHours(0, 0, 0, 0);

    const diffDays = Math.round(
      (today.getTime() - studied.getTime()) / (24 * 60 * 60 * 1000)
    );

    if (diffDays <= 0) return "Studied today";
    if (diffDays === 1) return "Studied yesterday";
    if (diffDays < 7) return `Studied ${diffDays} days ago`;

    return `Studied ${studied.toLocaleDateString()}`;
  }

  function getProfileInitials(name: string | null, email: string | null) {
    const source = (name?.trim() || email?.split("@")[0] || "learner").trim();
    const parts = source.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return source.slice(0, 2).toUpperCase();
  }

  function getLessonTitleById(lessonId: string | null) {
    if (!lessonId) return "Review session";
    return lessons.find((lesson) => lesson.id === lessonId)?.title ?? "Lesson session";
  }

  function getJournalTag(item: { lesson_id: string | null; note: string | null }): JournalTag {
    const lessonTitle = getLessonTitleById(item.lesson_id).toLowerCase();
    const noteText = item.note?.toLowerCase() ?? "";
    const combined = `${lessonTitle} ${noteText}`;

    if (item.lesson_id === null || combined.includes("review")) return "review";
    if (combined.includes("grammar") || combined.includes("article") || combined.includes("case")) {
      return "grammar";
    }
    if (combined.includes("speaking") || combined.includes("speak") || combined.includes("pronunciation")) {
      return "speaking";
    }
    if (combined.includes("listening") || combined.includes("listen") || combined.includes("audio")) {
      return "listening";
    }
    if (combined.includes("vocabulary") || combined.includes("vocab") || combined.includes("word")) {
      return "vocabulary";
    }

    return "all";
  }

  function beginEditingReflection(item: { id: string; note: string | null }) {
    setEditingReflectionId(item.id);
    setEditingReflectionNote(item.note ?? "");
  }

  function cancelEditingReflection() {
    setEditingReflectionId(null);
    setEditingReflectionNote("");
  }

  async function updateReflectionNote(nextNote: string | null) {
    if (!supabase || !session?.user || !editingReflectionId) {
      setMessage("Supabase is not ready yet.");
      return;
    }

    setEditingReflectionSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("session_logs")
      .update({
        note: nextNote,
      })
      .eq("id", editingReflectionId)
      .eq("user_id", session.user.id);

    setEditingReflectionSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRecentSessions((current) =>
      current.map((item) =>
        item.id === editingReflectionId
          ? { ...item, note: nextNote }
          : item
      )
    );
    setLessonHistory((current) =>
      current.map((item) =>
        item.id === editingReflectionId
          ? { ...item, note: nextNote }
          : item
      )
    );

    cancelEditingReflection();
    setMessage("Reflection updated.");
  }

  async function toggleReflectionPin(reflectionId: string, pinned: boolean) {
    if (!supabase || !session?.user) {
      setMessage("Supabase is not ready yet.");
      return;
    }

    setMessage(null);

    const { error } = await supabase
      .from("session_logs")
      .update({ pinned })
      .eq("id", reflectionId)
      .eq("user_id", session.user.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setRecentSessions((current) =>
      current.map((item) => (item.id === reflectionId ? { ...item, pinned } : item))
    );
    setLessonHistory((current) =>
      current.map((item) => (item.id === reflectionId ? { ...item, pinned } : item))
    );
    setMessage(pinned ? "Reflection pinned." : "Reflection unpinned.");
  }

  async function saveReflectionNote() {
    await updateReflectionNote(editingReflectionNote.trim() || null);
  }

  async function deleteReflectionNote() {
    await updateReflectionNote(null);
  }

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      if (!supabase) {
        if (mounted) setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase
      ? supabase.auth.onAuthStateChange((_event, nextSession) => {
          setSession(nextSession);
        })
      : { data: { subscription: null } };

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadProfile(activeSession: Session | null) {
      if (!supabase || !activeSession?.user) {
        if (mounted) setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,email,display_name,target_language,cefr_level,placement_level,daily_goal_minutes,onboarding_completed,streak_days,total_xp"
        )
        .eq("id", activeSession.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setMessage(error.message);
        setProfile(null);
        return;
      }

      setProfile(data);
      setDisplayName(data?.display_name ?? "");
      setSelectedLevel((data?.placement_level as (typeof placementChoices)[number]) ?? "A1");
      setDailyGoalMinutes(String(data?.daily_goal_minutes ?? 10));
    }

    loadProfile(session);

    return () => {
      mounted = false;
    };
  }, [session]);

  const screen: Screen = !session
    ? "auth"
    : lessonResult
      ? "summary"
    : activeLesson
      ? "lesson"
    : activeReviewIndex !== null
      ? "review"
    : profile?.onboarding_completed
      ? "dashboard"
      : "onboarding";

  useEffect(() => {
    let mounted = true;

    async function loadLessons(activeProfile: Profile | null) {
      if (!supabase || !activeProfile?.cefr_level) {
        if (mounted) {
          setLessons([]);
          setLessonsError(null);
          setLessonsLoading(false);
        }
        return;
      }

      setLessonsLoading(true);
      setLessonsError(null);

      const { data, error } = await supabase
        .from("lessons")
        .select("id,title,description,cefr_level,topic,estimated_minutes,sort_order")
        .eq("cefr_level", activeProfile.cefr_level)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        setLessons([]);
        setLessonsError(error.message);
        setLessonsLoading(false);
        return;
      }

      setLessons((data ?? []) as Lesson[]);
      setLessonsLoading(false);
    }

    if (screen === "dashboard") {
      loadLessons(profile);
      return () => {
        mounted = false;
      };
    }

    setLessons([]);
    setLessonsError(null);
    setLessonsLoading(false);

    return () => {
      mounted = false;
    };
  }, [profile, screen]);

  useEffect(() => {
    let mounted = true;

    async function loadLessonHistory(activeLessonId: string | null) {
      if (!supabase || !activeLessonId) {
        if (mounted) {
          setLessonHistory([]);
          setLessonHistoryError(null);
          setLessonHistoryLoading(false);
        }
        return;
      }

      setLessonHistoryLoading(true);
      setLessonHistoryError(null);

      const { data, error } = await supabase
        .from("session_logs")
        .select("id,created_at,accuracy,hint_usage,note,pinned")
        .eq("lesson_id", activeLessonId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!mounted) return;

      if (error) {
        setLessonHistory([]);
        setLessonHistoryError(error.message);
        setLessonHistoryLoading(false);
        return;
      }

      setLessonHistory(
        (data ?? []) as Array<{
          id: string;
          created_at: string;
          accuracy: number | null;
          hint_usage: number;
          note: string | null;
          pinned: boolean;
        }>
      );
      setLessonHistoryLoading(false);
    }

    if (screen === "lesson" && activeLesson) {
      loadLessonHistory(activeLesson.id);
      return () => {
        mounted = false;
      };
    }

    if (screen !== "summary") {
      setLessonHistory([]);
      setLessonHistoryError(null);
      setLessonHistoryLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [activeLesson, screen]);

  useEffect(() => {
    let mounted = true;

    async function loadRecentSessions(activeProfile: Profile | null) {
      if (!supabase || !activeProfile?.id) {
        if (mounted) {
          setRecentSessions([]);
          setRecentSessionsError(null);
          setRecentSessionsLoading(false);
        }
        return;
      }

      setRecentSessionsLoading(true);
      setRecentSessionsError(null);

      const { data, error } = await supabase
        .from("session_logs")
        .select("id,created_at,lesson_id,duration_seconds,accuracy,hint_usage,note,pinned")
        .eq("user_id", activeProfile.id)
        .gte("created_at", getWeekStart(new Date()).toISOString())
        .order("created_at", { ascending: false })
        .limit(20);

      if (!mounted) return;

      if (error) {
        setRecentSessions([]);
        setRecentSessionsError(error.message);
        setRecentSessionsLoading(false);
        return;
      }

      setRecentSessions(
        (data ?? []) as Array<{
          id: string;
          created_at: string;
          lesson_id: string | null;
          duration_seconds: number;
          accuracy: number | null;
          hint_usage: number;
          note: string | null;
          pinned: boolean;
        }>
      );
      setRecentSessionsLoading(false);
    }

    if (screen === "dashboard" || mainTab === "journal") {
      loadRecentSessions(profile);
      return () => {
        mounted = false;
      };
    }

    if (screen !== "lesson") {
      setRecentSessions([]);
      setRecentSessionsError(null);
      setRecentSessionsLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [profile, screen, mainTab]);

  useEffect(() => {
    let mounted = true;

    async function loadReviewCards(activeProfile: Profile | null) {
      if (!supabase || !activeProfile?.id) {
        if (mounted) {
          setSrsCards([]);
          setSrsError(null);
          setSrsLoading(false);
        }
        return;
      }

      setSrsLoading(true);
      setSrsError(null);

      const { data, error } = await supabase
        .from("srs_cards")
        .select("id,prompt,answer,srs_stage,due_at,last_reviewed_at")
        .eq("user_id", activeProfile.id)
        .lte("due_at", new Date().toISOString())
        .order("due_at", { ascending: true });

      if (!mounted) return;

      if (error) {
        setSrsCards([]);
        setSrsError(error.message);
        setSrsLoading(false);
        return;
      }

      setSrsCards((data ?? []) as SrsCard[]);
      setSrsLoading(false);
    }

    if (screen === "dashboard") {
      loadReviewCards(profile);
      return () => {
        mounted = false;
      };
    }

    if (screen !== "review") {
      setSrsCards([]);
      setSrsError(null);
      setSrsLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [profile, screen]);

  const greeting = useMemo(() => {
    const fallback = profile?.email?.split("@")[0] ?? "learner";
    return profile?.display_name ?? fallback;
  }, [profile]);

  async function handleAuthSubmit() {
    if (!supabase) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const action =
      authMode === "sign-in"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                display_name: email.split("@")[0] || "learner",
              },
            },
          });

    const { error } = await action;
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      authMode === "sign-in"
        ? "Signed in successfully."
        : "Account created. Check your inbox if email confirmation is enabled."
    );
  }

  async function handleOnboardingSubmit() {
    if (!supabase || !session?.user) {
      setMessage("Supabase is not ready yet.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const numericGoal = Number.parseInt(dailyGoalMinutes, 10);
    const minutes = Number.isFinite(numericGoal) ? Math.max(5, numericGoal) : 10;

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || profile?.display_name || greeting,
        cefr_level: selectedLevel,
        placement_level: selectedLevel,
        daily_goal_minutes: minutes,
        onboarding_completed: true,
      })
      .eq("id", session.user.id);

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const starterCards = [
      {
        user_id: session.user.id,
        prompt: "What is the polite phrase for ordering coffee?",
        answer: "Guten Tag, ich haette gern Kaffee",
        srs_stage: 0,
        due_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        last_reviewed_at: null,
      },
      {
        user_id: session.user.id,
        prompt: "Which article fits Brot in the accusative?",
        answer: "den Brot",
        srs_stage: 0,
        due_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        last_reviewed_at: null,
      },
    ];

    await supabase.from("srs_cards").insert(starterCards);

    setProfile((current) =>
      current
        ? {
            ...current,
            display_name: displayName.trim() || current.display_name,
            cefr_level: selectedLevel,
            placement_level: selectedLevel,
            daily_goal_minutes: minutes,
            onboarding_completed: true,
          }
        : current
    );
    setMessage("Onboarding saved.");
  }

  function handleOpenLesson(lesson: Lesson) {
    setActiveLesson(lesson);
    setSelectedQuizAnswer(null);
    setLessonNote("");
    setLessonHistoryQuery("");
    setMessage(null);
  }

  function handleCloseLesson() {
    setActiveLesson(null);
    setSelectedQuizAnswer(null);
    setLessonNote("");
  }

  function handleGoHome() {
    handleCloseLesson();
    handleCloseReview();
    handleCloseSummary();
    cancelEditingReflection();
    setMainTab("dashboard");
    setMessage(null);
  }

  function handleGoLessons() {
    handleCloseLesson();
    handleCloseReview();
    handleCloseSummary();
    cancelEditingReflection();
    setMainTab("lessons");
    setMessage(null);
  }

  function handleGoReview() {
    handleCloseLesson();
    handleCloseSummary();
    cancelEditingReflection();
    setMainTab("review");
    setMessage(null);
    if (srsCards.length > 0) {
      handleStartReview();
      return;
    }

    setMessage("No review cards are due right now.");
  }

  function handleGoJournal() {
    handleCloseLesson();
    handleCloseReview();
    handleCloseSummary();
    cancelEditingReflection();
    setMainTab("journal");
    setMessage(null);
  }

  function handleGoProgress() {
    handleCloseLesson();
    handleCloseReview();
    handleCloseSummary();
    cancelEditingReflection();
    setMainTab("progress");
    setMessage(null);
  }

  function handleCloseSummary() {
    setLessonResult(null);
    setSelectedQuizAnswer(null);
    setActiveLesson(null);
  }

  function handlePracticeAgain() {
    if (!lessonResult) return;
    setActiveLesson(lessonResult.lesson);
    setLessonResult(null);
    setSelectedQuizAnswer(null);
    setLessonNote("");
  }

  function handleStartReview() {
    if (srsCards.length === 0) {
      setMessage("No review cards are due right now.");
      return;
    }

    setActiveReviewIndex(0);
    setReviewRevealed(false);
    setMessage(null);
  }

  function handleCloseReview() {
    setActiveReviewIndex(null);
    setReviewRevealed(false);
    setMessage(null);
  }

  function handleRevealReviewAnswer() {
    setReviewRevealed(true);
  }

  async function handleReviewCard(known: boolean) {
    if (!supabase || !session?.user || activeReviewIndex === null) {
      setMessage("Supabase is not ready yet.");
      return;
    }

    const card = srsCards[activeReviewIndex];
    if (!card) {
      handleCloseReview();
      return;
    }

    const nextStage = known ? Math.min(card.srs_stage + 1, 5) : 0;
    const dueDays = known ? Math.min(14, 2 ** Math.max(nextStage, 1)) : 1;
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + dueDays);

    setReviewSaving(true);
    setMessage(null);

    const [cardUpdateResult, reviewLogResult] = await Promise.all([
      supabase
        .from("srs_cards")
        .update({
          srs_stage: nextStage,
          due_at: dueAt.toISOString(),
          last_reviewed_at: new Date().toISOString(),
        })
        .eq("id", card.id)
        .eq("user_id", session.user.id),
      supabase.from("session_logs").insert({
        user_id: session.user.id,
        lesson_id: null,
        duration_seconds: 60,
        accuracy: known ? 100 : 60,
        hint_usage: reviewRevealed ? 0 : 1,
      }),
    ]);

    setReviewSaving(false);

    if (cardUpdateResult.error) {
      setMessage(cardUpdateResult.error.message);
      return;
    }

    if (reviewLogResult.error) {
      setMessage(reviewLogResult.error.message);
      return;
    }

    const remaining = srsCards.filter((_, index) => index !== activeReviewIndex);
    setSrsCards(remaining);

    if (remaining.length === 0) {
      handleCloseReview();
      setMessage("Review complete for now.");
      return;
    }

    setActiveReviewIndex(0);
    setReviewRevealed(false);
  }

  async function handleCompleteLesson() {
    if (!supabase || !session?.user || !activeLesson) {
      setMessage("Supabase is not ready yet.");
      return;
    }

    if (selectedQuizAnswer === null) {
      setMessage("Choose an answer before completing the lesson.");
      return;
    }

    const quiz = buildLessonQuizAscii(activeLesson);
    const isCorrect = selectedQuizAnswer === quiz.correctIndex;
    const xpEarned = isCorrect ? 25 : 10;
    const accuracy = isCorrect ? 100 : 70;

    setLessonSaving(true);
    setMessage(null);

    const [sessionLogResult, profileUpdateResult] = await Promise.all([
      supabase.from("session_logs").insert({
        user_id: session.user.id,
        lesson_id: activeLesson.id,
        duration_seconds: activeLesson.estimated_minutes * 60,
        accuracy,
        hint_usage: selectedQuizAnswer === null ? 1 : 0,
        note: lessonNote.trim() || null,
      }),
      supabase
        .from("profiles")
        .update({
          total_xp: (profile?.total_xp ?? 0) + xpEarned,
          streak_days: (profile?.streak_days ?? 0) + 1,
        })
        .eq("id", session.user.id),
    ]);

    setLessonSaving(false);

    if (sessionLogResult.error) {
      setMessage(sessionLogResult.error.message);
      return;
    }

    if (profileUpdateResult.error) {
      setMessage(profileUpdateResult.error.message);
      return;
    }

    setProfile((current) =>
      current
        ? {
            ...current,
            total_xp: (current.total_xp ?? 0) + xpEarned,
            streak_days: (current.streak_days ?? 0) + 1,
        }
        : current
    );
    setLessonResult({
      lesson: activeLesson,
      correct: isCorrect,
      xpEarned,
      accuracy,
    });
    handleCloseLesson();
  }

  async function handleSaveProfile() {
    if (!supabase || !session?.user) {
      setMessage("Supabase is not ready yet.");
      return;
    }

    setProfileSaving(true);
    setMessage(null);

    const numericGoal = Number.parseInt(dailyGoalMinutes, 10);
    const minutes = Number.isFinite(numericGoal) ? Math.max(5, numericGoal) : 10;

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || profile?.display_name || "learner",
        cefr_level: selectedLevel,
        placement_level: selectedLevel,
        daily_goal_minutes: minutes,
      })
      .eq("id", session.user.id);

    setProfileSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setProfile((current) =>
      current
        ? {
            ...current,
            display_name: displayName.trim() || current.display_name,
            cefr_level: selectedLevel,
            placement_level: selectedLevel,
            daily_goal_minutes: minutes,
          }
        : current
    );
    setMessage("Profile updated.");
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage("Signed out.");
  }

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <CenteredNotice
          title="Connect Supabase"
          description="Add your Supabase URL and publishable key to `.env` to unlock auth and progress storage."
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <CenteredNotice
          title="Loading your lesson space"
          description="Connecting to Supabase and restoring your session."
          loading
        />
      </SafeAreaView>
    );
  }

  if (screen === "auth") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>German MVP</Text>
            </View>
            <Text style={styles.title}>Language Helper</Text>
            <Text style={styles.subtitle}>
              Sign in to save your streak, SRS queue, and lesson progress.
            </Text>
            <View style={styles.connectionPill}>
              <Text style={styles.connectionPillText}>
                Supabase connected
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {authMode === "sign-in" ? "Welcome back" : "Create your account"}
            </Text>
            <Text style={styles.cardDescription}>
              {authMode === "sign-in"
                ? "Sign in to continue your daily German practice."
                : "Create a profile to begin with a placement test and personalized lessons."}
            </Text>

            <View style={styles.form}>
              <LabeledInput
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <LabeledInput
                label="Password"
                placeholder="At least 6 characters"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              {message ? <Text style={styles.message}>{message}</Text> : null}

              <PrimaryButton
                label={
                  saving
                    ? "Working..."
                    : authMode === "sign-in"
                      ? "Sign in"
                      : "Create account"
                }
                onPress={handleAuthSubmit}
                disabled={saving || !email || !password}
              />

              <Pressable
                onPress={() =>
                  setAuthMode((current) =>
                    current === "sign-in" ? "sign-up" : "sign-in"
                  )
                }
              >
                <Text style={styles.inlineLink}>
                  {authMode === "sign-in"
                    ? "Need an account? Switch to sign up."
                    : "Already have an account? Switch to sign in."}
                </Text>
              </Pressable>
            </View>
          </View>

          <SectionCard
            title="What happens next"
            eyebrow="MVP flow"
            description="After auth, we can create a placement test, daily lesson plan, and SRS queue backed by Supabase."
          >
            <View style={styles.pillRow}>
              <Pill label="Onboarding" />
              <Pill label="Placement test" />
              <Pill label="Lesson engine" />
              <Pill label="Progress tracking" />
            </View>
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "onboarding") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Setup</Text>
            </View>
            <Text style={styles.title}>Quick placement check</Text>
            <Text style={styles.subtitle}>
              Pick your starting level and daily pace so we can shape the first
              lessons around your real routine.
            </Text>
            <View style={styles.connectionPill}>
              <Text style={styles.connectionPillText}>
                Profile for {greeting}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Finish your profile</Text>
            <Text style={styles.cardDescription}>
              This stores your placement choice and learning goal in Supabase.
            </Text>

            <View style={styles.form}>
              <LabeledInput
                label="Display name"
                placeholder="How should we greet you?"
                value={displayName}
                onChangeText={setDisplayName}
              />

              <View style={styles.field}>
                <Text style={styles.label}>Starting level</Text>
                <View style={styles.choiceRow}>
                  {placementChoices.map((choice) => (
                    <ChoiceChip
                      key={choice}
                      label={choice}
                      selected={selectedLevel === choice}
                      onPress={() => setSelectedLevel(choice)}
                    />
                  ))}
                </View>
              </View>

              <LabeledInput
                label="Daily goal minutes"
                placeholder="10"
                keyboardType="number-pad"
                value={dailyGoalMinutes}
                onChangeText={setDailyGoalMinutes}
              />

              {message ? <Text style={styles.message}>{message}</Text> : null}

              <PrimaryButton
                label={saving ? "Saving..." : "Continue to dashboard"}
                onPress={handleOnboardingSubmit}
                disabled={saving}
              />
            </View>
          </View>

          <SectionCard
            title="How we will use this"
            eyebrow="Adaptive plan"
            description="Your level and goal control lesson length, practice mix, and future recommendation logic."
          >
            <View style={styles.pillRow}>
              <Pill label="Profile sync" />
              <Pill label="Daily goal" />
              <Pill label="Lesson pacing" />
              <Pill label="SRS load" />
            </View>
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "lesson" && activeLesson) {
    const quiz = buildLessonQuizAscii(activeLesson);

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeLesson.cefr_level}</Text>
            </View>
            <Text style={styles.title}>{activeLesson.title}</Text>
            <Text style={styles.subtitle}>
              {activeLesson.description ?? activeLesson.topic}
            </Text>
            <View style={styles.connectionPill}>
              <Text style={styles.connectionPillText}>
                {activeLesson.estimated_minutes} minute lesson
              </Text>
            </View>
            <PrimaryButton label="Back to dashboard" onPress={handleCloseLesson} />
          </View>

            <SectionCard
              title="Practice prompt"
              eyebrow="Lesson step"
              description="Answer one quick question, then mark the lesson complete."
            >
            <Text style={styles.lessonPrompt}>{quiz.prompt}</Text>
            <View style={styles.quizColumn}>
              {quiz.options.map((option, index) => (
                <ChoiceChip
                  key={option}
                  label={option}
                  selected={selectedQuizAnswer === index}
                  onPress={() => setSelectedQuizAnswer(index)}
                />
              ))}
            </View>
            <Text style={styles.lessonHint}>Hint: {quiz.hint}</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Session note</Text>
              <TextInput
                value={lessonNote}
                onChangeText={setLessonNote}
                placeholder="What felt tricky or worth remembering?"
                placeholderTextColor="#7384A6"
                style={styles.textArea}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </SectionCard>

          <SectionCard
            title="Your history"
            eyebrow="Lesson context"
            description="A small record of how this specific lesson has gone before."
          >
            <View style={styles.field}>
              <Text style={styles.label}>Search lesson history</Text>
              <TextInput
                value={lessonHistoryQuery}
                onChangeText={setLessonHistoryQuery}
                placeholder="Search notes from this lesson"
                placeholderTextColor="#7384A6"
                style={styles.input}
              />
            </View>
            {lessonHistoryLoading ? (
              <View style={styles.inlineLoaderRow}>
                <ActivityIndicator color="#BFD0FF" />
                <Text style={styles.inlineLoaderText}>
                  Loading lesson history...
                </Text>
              </View>
            ) : filteredLessonHistory.length > 0 ? (
              <>
                <View style={styles.heroRow}>
                  <StatCard
                    label="Attempts"
                    value={`${filteredLessonHistory.length}`}
                  />
                  <StatCard
                    label="Avg. accuracy"
                    value={`${Math.round(
                      filteredLessonHistory.reduce(
                        (sum, item) => sum + (item.accuracy ?? 0),
                        0
                      ) / filteredLessonHistory.length
                    )}%`}
                  />
                  <StatCard
                    label="Mastery"
                    value={
                      filteredLessonHistory.length >= 3 &&
                      filteredLessonHistory.reduce(
                        (sum, item) => sum + (item.accuracy ?? 0),
                        0
                      ) /
                        filteredLessonHistory.length >=
                        90
                        ? "High"
                        : filteredLessonHistory.length >= 2
                          ? "Building"
                          : "Start"
                    }
                  />
                </View>
                {filteredLessonHistory.map((item) => (
                  <View key={item.id} style={styles.sessionRow}>
                    <View style={styles.sessionRowHeader}>
                      <Text style={styles.sessionRowTitle}>
                        {new Date(item.created_at).toLocaleString()}
                      </Text>
                      <Text style={styles.sessionRowMeta}>
                        {item.accuracy ?? 0}%
                      </Text>
                    </View>
                    <View style={styles.sessionRowFooter}>
                      <Text style={styles.sessionRowMeta}>
                        Hints: {item.hint_usage}
                      </Text>
                      <Text style={styles.sessionRowMeta}>
                        {item.accuracy && item.accuracy >= 90
                          ? "Strong run"
                          : "Keep practicing"}
                      </Text>
                    </View>
                    {editingReflectionId === item.id ? (
                      <>
                        <TextInput
                          value={editingReflectionNote}
                          onChangeText={setEditingReflectionNote}
                          placeholder="What felt tricky or worth remembering?"
                          placeholderTextColor="#7384A6"
                          style={styles.textArea}
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                        />
                        <View style={styles.reflectionActions}>
                          <Pressable
                            onPress={cancelEditingReflection}
                            style={({ pressed }) => [
                              styles.reflectionActionButton,
                              styles.reflectionActionButtonMuted,
                              pressed && styles.reflectionActionButtonPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.reflectionActionButtonText,
                                styles.reflectionActionButtonTextMuted,
                              ]}
                            >
                              Cancel
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={deleteReflectionNote}
                            disabled={editingReflectionSaving}
                            style={({ pressed }) => [
                              styles.reflectionActionButton,
                              styles.reflectionActionButtonDanger,
                              pressed && !editingReflectionSaving && styles.reflectionActionButtonPressed,
                              editingReflectionSaving && styles.primaryButtonDisabled,
                            ]}
                          >
                            <Text
                              style={[
                                styles.reflectionActionButtonText,
                                styles.reflectionActionButtonTextDanger,
                              ]}
                            >
                              Delete
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={saveReflectionNote}
                            disabled={editingReflectionSaving}
                            style={({ pressed }) => [
                              styles.reflectionActionButton,
                              pressed && !editingReflectionSaving && styles.reflectionActionButtonPressed,
                              editingReflectionSaving && styles.primaryButtonDisabled,
                            ]}
                          >
                            <Text style={styles.reflectionActionButtonText}>
                              {editingReflectionSaving ? "Saving..." : "Save"}
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <>
                        {item.note ? (
                          <Text style={styles.sessionRowNote}>{item.note}</Text>
                        ) : (
                          <Text style={styles.sessionRowMeta}>
                            No note yet. Add one to capture what to remember.
                          </Text>
                        )}
                        <View style={styles.reflectionHeaderActions}>
                          {item.note ? (
                            <Pressable
                              onPress={() => toggleReflectionPin(item.id, !item.pinned)}
                              style={({ pressed }) => [
                                styles.reflectionActionButton,
                                item.pinned
                                  ? styles.reflectionActionButtonPinned
                                  : styles.reflectionActionButtonMuted,
                                pressed && styles.reflectionActionButtonPressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.reflectionActionButtonText,
                                  item.pinned && styles.reflectionActionButtonTextPinned,
                                ]}
                              >
                                {item.pinned ? "Pinned" : "Pin"}
                              </Text>
                            </Pressable>
                          ) : null}
                          <Pressable
                            onPress={() => beginEditingReflection(item)}
                            style={({ pressed }) => [
                              styles.reflectionActionButton,
                              pressed && styles.reflectionActionButtonPressed,
                            ]}
                          >
                            <Text style={styles.reflectionActionButtonText}>
                              {item.note ? "Edit note" : "Add note"}
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.cardDescription}>
                {lessonHistoryQuery.trim()
                  ? "No lesson notes match that search yet."
                  : "No history yet. This will fill in after your first attempt."}
              </Text>
            )}
            {lessonHistoryError ? (
              <Text style={styles.message}>{lessonHistoryError}</Text>
            ) : null}
          </SectionCard>

          <SectionCard
            title="What to focus on"
            eyebrow="Lesson plan"
            description="A simple three-part loop keeps each session short and consistent."
          >
            <View style={styles.pillRow}>
              <Pill label="Vocabulary" />
              <Pill label="Grammar" />
              <Pill label="Listening" />
              <Pill label="Speaking" />
            </View>
          </SectionCard>

          {message ? <InfoBanner text={message} /> : null}

          <PrimaryButton
            label={lessonSaving ? "Saving lesson..." : "Complete lesson"}
            onPress={handleCompleteLesson}
            disabled={lessonSaving}
          />
          <TabBar activeTab={currentNavTab} onHome={handleGoHome} onLessons={handleGoLessons} onReview={handleGoReview} onJournal={handleGoJournal} onProgress={handleGoProgress} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "review") {
    const card = activeReviewIndex !== null ? srsCards[activeReviewIndex] : null;

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Review</Text>
            </View>
            <Text style={styles.title}>SRS review</Text>
            <Text style={styles.subtitle}>
              Work through the cards that are due today and keep the spacing
              schedule moving.
            </Text>
            <View style={styles.connectionPill}>
              <Text style={styles.connectionPillText}>
                {srsCards.length} cards due
              </Text>
            </View>
            <PrimaryButton label="Back to dashboard" onPress={handleCloseReview} />
          </View>

          {srsLoading ? (
            <View style={styles.card}>
              <View style={styles.inlineLoaderRow}>
                <ActivityIndicator color="#BFD0FF" />
                <Text style={styles.inlineLoaderText}>Loading review cards...</Text>
              </View>
            </View>
          ) : card ? (
            <SectionCard
              title={`Card ${activeReviewIndex! + 1} of ${srsCards.length}`}
              eyebrow="SRS queue"
              description="Recall the answer first, then reveal it and score yourself."
            >
              <Text style={styles.lessonPrompt}>{card.prompt}</Text>
              <View style={styles.quizColumn}>
                <View style={styles.reviewMetaRow}>
                  <View style={styles.lessonBadge}>
                    <Text style={styles.lessonBadgeText}>
                      Stage {card.srs_stage}
                    </Text>
                  </View>
                  <Text style={styles.lessonMeta}>
                    Due {new Date(card.due_at).toLocaleDateString()}
                  </Text>
                </View>
                {reviewRevealed ? (
                  <View style={styles.reviewAnswerBox}>
                    <Text style={styles.reviewAnswerLabel}>Answer</Text>
                    <Text style={styles.reviewAnswerText}>{card.answer}</Text>
                    <Text style={styles.lessonHint}>
                      {buildSrsCardHint(card.prompt)}
                    </Text>
                  </View>
                ) : (
                  <PrimaryButton
                    label="Reveal answer"
                    onPress={handleRevealReviewAnswer}
                  />
                )}
              </View>
            </SectionCard>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No cards due</Text>
              <Text style={styles.cardDescription}>
                Your review queue is empty for now. Come back later or seed more
                cards in Supabase.
              </Text>
            </View>
          )}

          {srsError ? <InfoBanner text={srsError} /> : null}
          {message ? <InfoBanner text={message} /> : null}

          {card ? (
            <View style={styles.heroRow}>
              <PrimaryButton
                label={reviewSaving ? "Saving..." : "Again"}
                onPress={() => handleReviewCard(false)}
                disabled={reviewSaving}
              />
              <PrimaryButton
                label={reviewSaving ? "Saving..." : "Got it"}
                onPress={() => handleReviewCard(true)}
                disabled={reviewSaving}
              />
            </View>
          ) : null}
          <TabBar activeTab={currentNavTab} onHome={handleGoHome} onLessons={handleGoLessons} onReview={handleGoReview} onJournal={handleGoJournal} onProgress={handleGoProgress} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "summary" && lessonResult) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {lessonResult.correct ? "Completed" : "Needs review"}
              </Text>
            </View>
            <Text style={styles.title}>Lesson summary</Text>
            <Text style={styles.subtitle}>
              {lessonResult.lesson.title} is logged and your progress has been
              updated in Supabase.
            </Text>
            <View style={styles.connectionPill}>
              <Text style={styles.connectionPillText}>
                +{lessonResult.xpEarned} XP
              </Text>
            </View>
          </View>

          <SectionCard
            title="Result"
            eyebrow="Immediate feedback"
            description="A quick recap of how the lesson went."
          >
            <View style={styles.heroRow}>
              <StatCard
                label="Accuracy"
                value={`${lessonResult.accuracy}%`}
              />
              <StatCard
                label="XP"
                value={`${lessonResult.xpEarned}`}
              />
              <StatCard
                label="Status"
                value={lessonResult.correct ? "Correct" : "Practice"}
              />
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryBoxTitle}>
                {lessonResult.correct
                  ? "Nice work. You answered the prompt correctly."
                  : "Good effort. The lesson is logged and ready for another pass."}
              </Text>
              <Text style={styles.summaryBoxText}>
                Next time, we can repeat this lesson or move into the next item
                in your CEFR track.
              </Text>
            </View>
          </SectionCard>

          <SectionCard
            title="What happened"
            eyebrow="Lesson log"
            description="The summary is driven by the session log we just wrote."
          >
            <View style={styles.pillRow}>
              <Pill label={lessonResult.lesson.cefr_level} />
              <Pill label={`${lessonResult.lesson.estimated_minutes} min`} />
              <Pill label="Session logged" />
            </View>
          </SectionCard>

          <View style={styles.heroRow}>
            <PrimaryButton label="Back to dashboard" onPress={handleCloseSummary} />
            <PrimaryButton label="Practice again" onPress={handlePracticeAgain} />
          </View>
          <TabBar activeTab={currentNavTab} onHome={handleGoHome} onLessons={handleGoLessons} onReview={handleGoReview} onJournal={handleGoJournal} onProgress={handleGoProgress} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ExpoStatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Signed in</Text>
          </View>
          <Text style={styles.title}>Willkommen, {greeting}</Text>
          <Text style={styles.subtitle}>
            Your profile is now connected to Supabase and ready for lesson,
            streak, and SRS data.
          </Text>
          <View style={styles.connectionPill}>
            <Text style={styles.connectionPillText}>
              {profile?.cefr_level ?? "A1"} learning path
            </Text>
          </View>
          <PrimaryButton label="Sign out" onPress={handleSignOut} />
        </View>

        {message ? <InfoBanner text={message} /> : null}

        <SectionCard
          title="Profile snapshot"
          eyebrow="Synced data"
          description="This comes from the `profiles` table and will later drive adaptive lesson sequencing."
        >
          <View style={styles.heroRow}>
            <StatCard
              label="Streak"
              value={`${profile?.streak_days ?? 0} days`}
            />
            <StatCard label="XP" value={`${profile?.total_xp ?? 0}`} />
            <StatCard label="Goal" value={`${profile?.daily_goal_minutes ?? 10} min`} />
          </View>
        </SectionCard>

        <SectionCard
          title="Achievements"
          eyebrow="Motivation"
          description="Small milestones that track consistency and momentum."
        >
          <View style={styles.achievementList}>
            {achievementList.map((achievement) => (
              <View
                key={achievement.title}
                style={[
                  styles.achievementItem,
                  achievement.unlocked && styles.achievementItemUnlocked,
                ]}
              >
                <View style={styles.achievementTextBlock}>
                  <Text
                    style={[
                      styles.achievementTitle,
                      achievement.unlocked && styles.achievementTitleUnlocked,
                    ]}
                  >
                    {achievement.title}
                  </Text>
                  <Text style={styles.achievementDescription}>
                    {achievement.description}
                  </Text>
                </View>
                <View
                  style={[
                    styles.achievementPill,
                    achievement.unlocked && styles.achievementPillUnlocked,
                  ]}
                >
                  <Text
                    style={[
                      styles.achievementPillText,
                      achievement.unlocked && styles.achievementPillTextUnlocked,
                    ]}
                  >
                    {achievement.unlocked ? "Unlocked" : "Locked"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>

        {highlightedAchievement ? (
          <SectionCard
            title="Milestone spotlight"
            eyebrow="Celebration"
            description="Your most recent unlocked milestone gets a little extra shine."
          >
            <View style={styles.spotlightCard}>
              <View style={styles.spotlightBadge}>
                <Text style={styles.spotlightBadgeText}>Unlocked</Text>
              </View>
              <Text style={styles.spotlightTitle}>
                {highlightedAchievement.title}
              </Text>
              <Text style={styles.spotlightDescription}>
                {highlightedAchievement.description}
              </Text>
            </View>
          </SectionCard>
        ) : null}

        {mainTab === "dashboard" ? (
          <>
            <SectionCard
              title="Review queue"
              eyebrow="Spaced repetition"
              description="Use quick reviews to keep vocab alive and gradually move cards out."
            >
              <View style={styles.reviewSummaryRow}>
                <StatCard label="Due now" value={`${srsCards.length}`} />
                <StatCard label="Stage 0" value="Start here" />
              </View>
              {srsLoading ? (
                <View style={styles.inlineLoaderRow}>
                  <ActivityIndicator color="#BFD0FF" />
                  <Text style={styles.inlineLoaderText}>Loading review queue...</Text>
                </View>
              ) : null}
              {srsError ? <Text style={styles.message}>{srsError}</Text> : null}
              <PrimaryButton
                label={srsCards.length > 0 ? "Start review" : "No cards due"}
                onPress={handleStartReview}
                disabled={srsCards.length === 0}
              />
            </SectionCard>

            <SectionCard
              title="Recent sessions"
              eyebrow="Activity log"
              description="A quick look at what happened in your latest lessons and reviews."
            >
              {recentSessionsLoading ? (
                <View style={styles.inlineLoaderRow}>
                  <ActivityIndicator color="#BFD0FF" />
                  <Text style={styles.inlineLoaderText}>Loading session history...</Text>
                </View>
              ) : recentSessions.length > 0 ? (
                <>
                  <View style={styles.heroRow}>
                    <StatCard
                      label="Sessions"
                      value={`${recentSessions.length}`}
                    />
                    <StatCard
                      label="Avg. min"
                      value={`${Math.round(
                        recentSessions.reduce(
                          (sum, item) => sum + item.duration_seconds,
                          0
                        ) /
                          60 /
                          recentSessions.length
                      )}`}
                    />
                    <StatCard
                      label="Hints"
                      value={`${recentSessions.reduce(
                        (sum, item) => sum + item.hint_usage,
                        0
                      )}`}
                    />
                  </View>
                  {recentSessions.map((item) => (
                    <View key={item.id} style={styles.sessionRow}>
                      <View style={styles.sessionRowHeader}>
                        <Text style={styles.sessionRowTitle}>
                          {new Date(item.created_at).toLocaleString()}
                        </Text>
                        <Text style={styles.sessionRowMeta}>
                          {Math.round(item.duration_seconds / 60)} min
                        </Text>
                      </View>
                      <View style={styles.sessionRowFooter}>
                        <Text style={styles.sessionRowMeta}>
                          Accuracy: {item.accuracy ?? 0}%
                        </Text>
                        <Text style={styles.sessionRowMeta}>
                          Hints: {item.hint_usage}
                        </Text>
                      </View>
                      <Text style={styles.sessionRowMeta}>
                        {getLessonTitleById(item.lesson_id)}
                      </Text>
                      {item.note ? (
                        <Text style={styles.sessionRowNote}>{item.note}</Text>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.cardDescription}>
                  No session history yet. Finish a lesson to start the log.
                </Text>
              )}
              {recentSessionsError ? (
                <Text style={styles.message}>{recentSessionsError}</Text>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Recent reflections"
              eyebrow="Notes"
              description="The last few things you wrote after practice, ready to revisit."
            >
              <View style={styles.field}>
                <Text style={styles.label}>Search reflections</Text>
                <TextInput
                  value={reflectionQuery}
                  onChangeText={setReflectionQuery}
                  placeholder="Try a word, lesson title, or skill"
                  placeholderTextColor="#7384A6"
                  style={styles.input}
                />
              </View>
              <PrimaryButton label="Open journal" onPress={handleGoJournal} />
              {recentReflections.length > 0 ? (
                <View style={styles.reflectionList}>
                  {recentReflections.map((item) => (
                    <View key={item.id} style={styles.reflectionCard}>
                      <View style={styles.reflectionHeader}>
                        <View style={styles.reflectionHeaderText}>
                          <Text style={styles.reflectionTitle}>
                            {getLessonTitleById(item.lesson_id)}
                          </Text>
                          <Text style={styles.reflectionMeta}>
                            {new Date(item.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={styles.reflectionHeaderActions}>
                          <Pressable
                            onPress={() => toggleReflectionPin(item.id, !item.pinned)}
                            style={({ pressed }) => [
                              styles.reflectionActionButton,
                              item.pinned
                                ? styles.reflectionActionButtonPinned
                                : styles.reflectionActionButtonMuted,
                              pressed && styles.reflectionActionButtonPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.reflectionActionButtonText,
                                item.pinned && styles.reflectionActionButtonTextPinned,
                              ]}
                            >
                              {item.pinned ? "Pinned" : "Pin"}
                            </Text>
                          </Pressable>
                          {editingReflectionId !== item.id ? (
                            <Pressable
                              onPress={() => beginEditingReflection(item)}
                              style={({ pressed }) => [
                                styles.reflectionActionButton,
                                pressed && styles.reflectionActionButtonPressed,
                              ]}
                            >
                              <Text style={styles.reflectionActionButtonText}>
                                Edit
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                      {editingReflectionId === item.id ? (
                        <>
                          <TextInput
                            value={editingReflectionNote}
                            onChangeText={setEditingReflectionNote}
                            placeholder="What felt tricky or worth remembering?"
                            placeholderTextColor="#7384A6"
                            style={styles.textArea}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                          />
                          <View style={styles.reflectionActions}>
                            <Pressable
                              onPress={cancelEditingReflection}
                              style={({ pressed }) => [
                                styles.reflectionActionButton,
                                styles.reflectionActionButtonMuted,
                                pressed && styles.reflectionActionButtonPressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.reflectionActionButtonText,
                                  styles.reflectionActionButtonTextMuted,
                                ]}
                              >
                                Cancel
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={deleteReflectionNote}
                              disabled={editingReflectionSaving}
                              style={({ pressed }) => [
                                styles.reflectionActionButton,
                                styles.reflectionActionButtonDanger,
                                pressed && !editingReflectionSaving && styles.reflectionActionButtonPressed,
                                editingReflectionSaving && styles.primaryButtonDisabled,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.reflectionActionButtonText,
                                  styles.reflectionActionButtonTextDanger,
                                ]}
                              >
                                Delete
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={saveReflectionNote}
                              disabled={editingReflectionSaving}
                              style={({ pressed }) => [
                                styles.reflectionActionButton,
                                pressed && !editingReflectionSaving && styles.reflectionActionButtonPressed,
                                editingReflectionSaving && styles.primaryButtonDisabled,
                              ]}
                            >
                              <Text style={styles.reflectionActionButtonText}>
                                {editingReflectionSaving ? "Saving..." : "Save"}
                              </Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <Text style={styles.reflectionBody}>{item.note}</Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.cardDescription}>
                  {reflectionQuery.trim()
                    ? "No reflections match that search yet."
                    : "Add a note after your next lesson and it will appear here."}
                </Text>
              )}
            </SectionCard>

            <SectionCard
              title="Today's lesson"
              eyebrow="Adaptive plan"
              description="A compact session built from your weak spots and current CEFR level."
            >
              {lessonsLoading ? (
                <View style={styles.inlineLoaderRow}>
                  <ActivityIndicator color="#BFD0FF" />
                  <Text style={styles.inlineLoaderText}>Loading lessons...</Text>
                </View>
              ) : lessons.length > 0 ? (
                lessons.map((lesson, index) => {
                  const progressEntry = lessonProgress.get(lesson.id);
                  const progressBadge = getLessonProgressBadge(lesson.id);
                  const masteryBadge = getLessonMasteryBadge(lesson.id);

                  return (
                    <Pressable
                      key={lesson.id}
                      onPress={() => handleOpenLesson(lesson)}
                      style={({ pressed }) => [
                        styles.lessonCard,
                        pressed && styles.lessonCardPressed,
                      ]}
                    >
                      <View style={styles.lessonCardHeader}>
                        <View style={styles.lessonBadgeRow}>
                          <View style={styles.lessonBadge}>
                            <Text style={styles.lessonBadgeText}>
                              {lesson.cefr_level}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.lessonStatusBadge,
                              progressBadge.tone === "new" &&
                                styles.lessonStatusBadgeNew,
                              progressBadge.tone === "progress" &&
                                styles.lessonStatusBadgeProgress,
                              progressBadge.tone === "done" &&
                                styles.lessonStatusBadgeDone,
                            ]}
                          >
                            <Text
                              style={[
                                styles.lessonStatusText,
                                progressBadge.tone === "done" &&
                                  styles.lessonStatusTextDone,
                              ]}
                            >
                              {progressBadge.label}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.lessonStatusBadge,
                              styles.lessonMasteryBadge,
                              masteryBadge.tone === "new" &&
                                styles.lessonMasteryBadgeNew,
                              masteryBadge.tone === "progress" &&
                                styles.lessonMasteryBadgeProgress,
                              masteryBadge.tone === "done" &&
                                styles.lessonMasteryBadgeDone,
                            ]}
                          >
                            <Text
                              style={[
                                styles.lessonStatusText,
                                masteryBadge.tone === "done" &&
                                  styles.lessonStatusTextDone,
                              ]}
                            >
                              {masteryBadge.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.lessonMeta}>
                          {lesson.estimated_minutes} min
                        </Text>
                      </View>
                      <Text style={styles.lessonTitle}>{lesson.title}</Text>
                      <Text style={styles.lessonDescription}>
                        {lesson.description ?? lesson.topic}
                      </Text>
                      <Text style={styles.lessonProgressMeta}>
                        {progressEntry
                          ? formatLastStudied(progressEntry.lastCompletedAt)
                          : "Not studied yet"}
                      </Text>
                      <View style={styles.lessonStepRow}>
                        <View style={styles.stepIndex}>
                          <Text style={styles.stepIndexText}>{index + 1}</Text>
                        </View>
                        <Text style={styles.stepText}>{lesson.topic}</Text>
                      </View>
                      <Text style={styles.lessonTapLabel}>Tap to open lesson</Text>
                    </Pressable>
                  );
                })
              ) : (
                lessonSteps.map((step, index) => (
                  <View key={step} style={styles.stepRow}>
                    <View style={styles.stepIndex}>
                      <Text style={styles.stepIndexText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))
              )}
              {lessonsError ? <Text style={styles.message}>{lessonsError}</Text> : null}
            </SectionCard>

            <SectionCard
              title="Progress snapshot"
              eyebrow="Skill tracking"
              description="Track proficiency per skill so the app can adapt the next lesson."
            >
              {skills.map((skill) => (
                <View key={skill.key} style={styles.skillRow}>
                  <View style={styles.skillHeader}>
                    <Text style={styles.skillLabel}>{skill.key}</Text>
                    <Text style={styles.skillValue}>{skill.value}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${skill.value}%`, backgroundColor: skill.tone },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </SectionCard>

            <SectionCard
              title="Weekly rhythm"
              eyebrow="Consistency"
              description="A seven-day view of how often you showed up this week."
            >
              <View style={styles.weekSummaryRow}>
                <StatCard label="Active days" value={`${weeklyActiveDays}`} />
                <StatCard label="Minutes" value={`${weeklyMinutes}`} />
              </View>
              <View style={styles.weekChart}>
                {weeklyActivity.map((day) => (
                  <View key={day.label} style={styles.weekChartDay}>
                    <View style={styles.weekBarTrack}>
                      <View
                        style={[
                          styles.weekBarFill,
                          { height: `${Math.max(12, day.value * 28)}%` },
                          day.value > 0 ? styles.weekBarActive : styles.weekBarIdle,
                        ]}
                      />
                    </View>
                    <Text style={styles.weekChartLabel}>{day.label}</Text>
                    <Text style={styles.weekChartMeta}>
                      {day.value > 0 ? `${day.minutes}m` : "0m"}
                    </Text>
                  </View>
                ))}
              </View>
            </SectionCard>

            <SectionCard
              title="Streak track"
              eyebrow="Momentum"
              description="A 14-day strip showing whether you touched the app each day."
            >
              <View style={styles.streakSummaryRow}>
                <StatCard label="Current run" value={`${streakRun} days`} />
                <StatCard label="This week" value={`${weeklyActiveDays} days`} />
              </View>
              <View style={styles.streakTrack}>
                {streakTrack.map((day) => (
                  <View
                    key={day.key}
                    style={[
                      styles.streakDot,
                      day.active && styles.streakDotActive,
                      day.isToday && styles.streakDotToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.streakDotText,
                        day.active && styles.streakDotTextActive,
                      ]}
                    >
                      {day.label}
                    </Text>
                  </View>
                ))}
              </View>
            </SectionCard>
          </>
        ) : null}

        {mainTab === "lessons" ? (
          <>
            <SectionCard
              title="Lesson library"
              eyebrow="Browse content"
              description="Pick a lesson from the current CEFR track and jump straight into practice."
            >
              <View style={styles.filterRow}>
                {lessonFilters.map((filter) => (
                  <Pressable
                    key={filter.key}
                    onPress={() => setLessonFilter(filter.key)}
                    style={[
                      styles.filterChip,
                      lessonFilter === filter.key && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        lessonFilter === filter.key && styles.filterChipTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                    <Text
                      style={[
                        styles.filterChipCount,
                        lessonFilter === filter.key && styles.filterChipCountActive,
                      ]}
                    >
                      {lessonFilterCounts[filter.key]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {lessonsLoading ? (
                <View style={styles.inlineLoaderRow}>
                  <ActivityIndicator color="#BFD0FF" />
                  <Text style={styles.inlineLoaderText}>Loading lessons...</Text>
                </View>
              ) : filteredLessons.length > 0 ? (
                filteredLessons.map((lesson, index) => {
                  const progressEntry = lessonProgress.get(lesson.id);
                  const progressBadge = getLessonProgressBadge(lesson.id);
                  const masteryBadge = getLessonMasteryBadge(lesson.id);

                  return (
                    <Pressable
                      key={lesson.id}
                      onPress={() => handleOpenLesson(lesson)}
                      style={({ pressed }) => [
                        styles.lessonCard,
                        pressed && styles.lessonCardPressed,
                      ]}
                    >
                      <View style={styles.lessonCardHeader}>
                        <View style={styles.lessonBadgeRow}>
                          <View style={styles.lessonBadge}>
                            <Text style={styles.lessonBadgeText}>
                              {lesson.cefr_level}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.lessonStatusBadge,
                              progressBadge.tone === "new" &&
                                styles.lessonStatusBadgeNew,
                              progressBadge.tone === "progress" &&
                                styles.lessonStatusBadgeProgress,
                              progressBadge.tone === "done" &&
                                styles.lessonStatusBadgeDone,
                            ]}
                          >
                            <Text
                              style={[
                                styles.lessonStatusText,
                                progressBadge.tone === "done" &&
                                  styles.lessonStatusTextDone,
                              ]}
                            >
                              {progressBadge.label}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.lessonStatusBadge,
                              styles.lessonMasteryBadge,
                              masteryBadge.tone === "new" &&
                                styles.lessonMasteryBadgeNew,
                              masteryBadge.tone === "progress" &&
                                styles.lessonMasteryBadgeProgress,
                              masteryBadge.tone === "done" &&
                                styles.lessonMasteryBadgeDone,
                            ]}
                          >
                            <Text
                              style={[
                                styles.lessonStatusText,
                                masteryBadge.tone === "done" &&
                                  styles.lessonStatusTextDone,
                              ]}
                            >
                              {masteryBadge.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.lessonMeta}>
                          {lesson.estimated_minutes} min
                        </Text>
                      </View>
                      <Text style={styles.lessonTitle}>{lesson.title}</Text>
                      <Text style={styles.lessonDescription}>
                        {lesson.description ?? lesson.topic}
                      </Text>
                      <Text style={styles.lessonProgressMeta}>
                        {progressEntry
                          ? formatLastStudied(progressEntry.lastCompletedAt)
                          : "Not studied yet"}
                      </Text>
                      <View style={styles.lessonStepRow}>
                        <View style={styles.stepIndex}>
                          <Text style={styles.stepIndexText}>{index + 1}</Text>
                        </View>
                        <Text style={styles.stepText}>{lesson.topic}</Text>
                      </View>
                      <Text style={styles.lessonTapLabel}>Tap to open lesson</Text>
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.cardDescription}>
                  {lessonFilter === "all"
                    ? "No lessons loaded yet. Seed the lessons table in Supabase."
                    : "No lessons match this filter yet."}
                </Text>
              )}
              {lessonsError ? <Text style={styles.message}>{lessonsError}</Text> : null}
            </SectionCard>

            <SectionCard
              title="Suggested track"
              eyebrow="Recommended next"
              description="Your current level determines the lesson set we show first."
            >
              <View style={styles.reviewSummaryRow}>
                <StatCard label="Level" value={profile?.cefr_level ?? "A1"} />
                <StatCard label="Goal" value={`${profile?.daily_goal_minutes ?? 10} min`} />
              </View>
              <PrimaryButton
                label={filteredLessons.length > 0 ? "Open first lesson" : "No lessons loaded"}
                onPress={() => filteredLessons[0] && handleOpenLesson(filteredLessons[0])}
                disabled={filteredLessons.length === 0}
              />
            </SectionCard>
          </>
        ) : null}

        {mainTab === "review" ? (
          <>
            <SectionCard
              title="Review queue"
              eyebrow="Spaced repetition"
              description="Use quick reviews to keep vocab alive and gradually move cards out."
            >
              <View style={styles.reviewSummaryRow}>
                <StatCard label="Due now" value={`${srsCards.length}`} />
                <StatCard label="Stage 0" value="Start here" />
              </View>
              {srsLoading ? (
                <View style={styles.inlineLoaderRow}>
                  <ActivityIndicator color="#BFD0FF" />
                  <Text style={styles.inlineLoaderText}>Loading review queue...</Text>
                </View>
              ) : null}
              {srsError ? <Text style={styles.message}>{srsError}</Text> : null}
              <PrimaryButton
                label={srsCards.length > 0 ? "Start review" : "No cards due"}
                onPress={handleStartReview}
                disabled={srsCards.length === 0}
              />
            </SectionCard>

            <SectionCard
              title="Recent sessions"
              eyebrow="Activity log"
              description="A quick look at what happened in your latest lessons and reviews."
            >
              {recentSessionsLoading ? (
                <View style={styles.inlineLoaderRow}>
                  <ActivityIndicator color="#BFD0FF" />
                  <Text style={styles.inlineLoaderText}>Loading session history...</Text>
                </View>
              ) : recentSessions.length > 0 ? (
                <>
                  <View style={styles.heroRow}>
                    <StatCard
                      label="Sessions"
                      value={`${recentSessions.length}`}
                    />
                    <StatCard
                      label="Avg. min"
                      value={`${Math.round(
                        recentSessions.reduce(
                          (sum, item) => sum + item.duration_seconds,
                          0
                        ) /
                          60 /
                          recentSessions.length
                      )}`}
                    />
                    <StatCard
                      label="Hints"
                      value={`${recentSessions.reduce(
                        (sum, item) => sum + item.hint_usage,
                        0
                      )}`}
                    />
                  </View>
                  {recentSessions.map((item) => (
                    <View key={item.id} style={styles.sessionRow}>
                      <View style={styles.sessionRowHeader}>
                        <Text style={styles.sessionRowTitle}>
                          {new Date(item.created_at).toLocaleString()}
                        </Text>
                        <Text style={styles.sessionRowMeta}>
                          {Math.round(item.duration_seconds / 60)} min
                        </Text>
                      </View>
                      <View style={styles.sessionRowFooter}>
                        <Text style={styles.sessionRowMeta}>
                          Accuracy: {item.accuracy ?? 0}%
                        </Text>
                        <Text style={styles.sessionRowMeta}>
                          Hints: {item.hint_usage}
                        </Text>
                      </View>
                      <Text style={styles.sessionRowMeta}>
                        {getLessonTitleById(item.lesson_id)}
                      </Text>
                      {item.note ? (
                        <Text style={styles.sessionRowNote}>{item.note}</Text>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.cardDescription}>
                  No session history yet. Finish a lesson to start the log.
                </Text>
              )}
              {recentSessionsError ? (
                <Text style={styles.message}>{recentSessionsError}</Text>
              ) : null}
            </SectionCard>
          </>
        ) : null}

        {mainTab === "journal" ? (
          <>
            <SectionCard
              title="Study journal"
              eyebrow="Notes"
              description="Browse every reflection you have saved and quickly find the one you want to revisit."
            >
              <View style={styles.field}>
                <Text style={styles.label}>Search journal</Text>
                <TextInput
                  value={journalQuery}
                  onChangeText={setJournalQuery}
                  placeholder="Try a lesson title, date, or note"
                  placeholderTextColor="#7384A6"
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Sort journal</Text>
                <View style={styles.choiceRow}>
                  <Pressable
                    onPress={() => setJournalSort("newest")}
                    style={[
                      styles.choiceChip,
                      journalSort === "newest" && styles.choiceChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceChipText,
                        journalSort === "newest" && styles.choiceChipTextSelected,
                      ]}
                    >
                      Newest
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setJournalSort("oldest")}
                    style={[
                      styles.choiceChip,
                      journalSort === "oldest" && styles.choiceChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceChipText,
                        journalSort === "oldest" && styles.choiceChipTextSelected,
                      ]}
                    >
                      Oldest
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Pinned filter</Text>
                <View style={styles.choiceRow}>
                  <Pressable
                    onPress={() => setJournalPinnedOnly((value) => !value)}
                    style={[
                      styles.choiceChip,
                      journalPinnedOnly && styles.choiceChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceChipText,
                        journalPinnedOnly && styles.choiceChipTextSelected,
                      ]}
                    >
                      Pinned only
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Journal tags</Text>
                <View style={styles.choiceRow}>
                  {([
                    ["all", "All"],
                    ["grammar", "Grammar"],
                    ["vocabulary", "Vocabulary"],
                    ["speaking", "Speaking"],
                    ["listening", "Listening"],
                    ["review", "Review"],
                  ] as Array<[JournalTag, string]>).map(([tag, label]) => (
                    <Pressable
                      key={tag}
                      onPress={() => setJournalTag(tag)}
                      style={[
                        styles.choiceChip,
                        journalTag === tag && styles.choiceChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          journalTag === tag && styles.choiceChipTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {journalEntries.length > 0 ? (
                <View style={styles.reflectionList}>
                  {journalEntries.map((item) => (
                    <View key={item.id} style={styles.reflectionCard}>
                      <View style={styles.reflectionHeader}>
                        <View style={styles.reflectionHeaderText}>
                          <Text style={styles.reflectionTitle}>
                            {getLessonTitleById(item.lesson_id)}
                          </Text>
                          <Text style={styles.reflectionMeta}>
                            {new Date(item.created_at).toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.lessonBadge}>
                          <Text style={styles.lessonBadgeText}>
                            {getJournalTag(item)}
                          </Text>
                        </View>
                        <View style={styles.reflectionHeaderActions}>
                          <Pressable
                            onPress={() => toggleReflectionPin(item.id, !item.pinned)}
                            style={({ pressed }) => [
                              styles.reflectionActionButton,
                              item.pinned
                                ? styles.reflectionActionButtonPinned
                                : styles.reflectionActionButtonMuted,
                              pressed && styles.reflectionActionButtonPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.reflectionActionButtonText,
                                item.pinned && styles.reflectionActionButtonTextPinned,
                              ]}
                            >
                              {item.pinned ? "Pinned" : "Pin"}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => beginEditingReflection(item)}
                            style={({ pressed }) => [
                              styles.reflectionActionButton,
                              pressed && styles.reflectionActionButtonPressed,
                            ]}
                          >
                            <Text style={styles.reflectionActionButtonText}>
                              {editingReflectionId === item.id ? "Editing" : "Edit"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                      {editingReflectionId === item.id ? (
                        <>
                          <TextInput
                            value={editingReflectionNote}
                            onChangeText={setEditingReflectionNote}
                            placeholder="What felt tricky or worth remembering?"
                            placeholderTextColor="#7384A6"
                            style={styles.textArea}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                          />
                          <View style={styles.reflectionActions}>
                            <Pressable
                              onPress={cancelEditingReflection}
                              style={({ pressed }) => [
                                styles.reflectionActionButton,
                                styles.reflectionActionButtonMuted,
                                pressed && styles.reflectionActionButtonPressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.reflectionActionButtonText,
                                  styles.reflectionActionButtonTextMuted,
                                ]}
                              >
                                Cancel
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={deleteReflectionNote}
                              disabled={editingReflectionSaving}
                              style={({ pressed }) => [
                                styles.reflectionActionButton,
                                styles.reflectionActionButtonDanger,
                                pressed && !editingReflectionSaving && styles.reflectionActionButtonPressed,
                                editingReflectionSaving && styles.primaryButtonDisabled,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.reflectionActionButtonText,
                                  styles.reflectionActionButtonTextDanger,
                                ]}
                              >
                                Delete
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={saveReflectionNote}
                              disabled={editingReflectionSaving}
                              style={({ pressed }) => [
                                styles.reflectionActionButton,
                                pressed && !editingReflectionSaving && styles.reflectionActionButtonPressed,
                                editingReflectionSaving && styles.primaryButtonDisabled,
                              ]}
                            >
                              <Text style={styles.reflectionActionButtonText}>
                                {editingReflectionSaving ? "Saving..." : "Save"}
                              </Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <Text style={styles.reflectionBody}>{item.note}</Text>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.cardDescription}>
                  {journalPinnedOnly
                    ? "No pinned reflections yet. Pin a reflection to bring it here."
                    : journalQuery.trim()
                    ? "No journal entries match that search yet."
                    : "Your journal will fill up as you add lesson notes."}
                </Text>
              )}
            </SectionCard>
          </>
        ) : null}

        {mainTab === "progress" ? (
          <>
            <SectionCard
              title="Profile at a glance"
              eyebrow="Identity"
              description="A quick snapshot of the account, level, and pace you are learning with."
            >
              <View style={styles.profileHeader}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>
                    {getProfileInitials(profile?.display_name ?? displayName, profile?.email)}
                  </Text>
                </View>
                <View style={styles.profileHeaderContent}>
                  <Text style={styles.profileHeaderName}>
                    {profile?.display_name ?? greeting}
                  </Text>
                  <Text style={styles.profileHeaderMeta}>
                    {profile?.email ?? "Signed in and syncing"}
                  </Text>
                  <View style={styles.profileHeaderRow}>
                    <View style={styles.profileBadge}>
                      <Text style={styles.profileBadgeText}>
                        {profile?.cefr_level ?? selectedLevel} track
                      </Text>
                    </View>
                    <View style={styles.profileBadgeSoft}>
                      <Text style={styles.profileBadgeSoftText}>
                        {profile?.daily_goal_minutes ?? 10} min / day
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </SectionCard>

            <SectionCard
              title="Profile settings"
              eyebrow="Your plan"
              description="Keep your name, level, and daily goal aligned with your current routine."
            >
              <View style={styles.form}>
                <LabeledInput
                  label="Display name"
                  placeholder="How should we greet you?"
                  value={displayName}
                  onChangeText={setDisplayName}
                />
                <View style={styles.field}>
                  <Text style={styles.label}>Starting level</Text>
                  <View style={styles.choiceRow}>
                    {placementChoices.map((choice) => (
                      <ChoiceChip
                        key={choice}
                        label={choice}
                        selected={selectedLevel === choice}
                        onPress={() => setSelectedLevel(choice)}
                      />
                    ))}
                  </View>
                </View>
                <LabeledInput
                  label="Daily goal minutes"
                  placeholder="10"
                  keyboardType="number-pad"
                  value={dailyGoalMinutes}
                  onChangeText={setDailyGoalMinutes}
                />
                <PrimaryButton
                  label={profileSaving ? "Saving..." : "Save profile"}
                  onPress={handleSaveProfile}
                  disabled={profileSaving}
                />
              </View>
            </SectionCard>

            <SectionCard
              title="Progress overview"
              eyebrow="Snapshot"
              description="A compact summary of your current effort and consistency."
            >
              <View style={styles.heroRow}>
                <StatCard label="XP" value={`${profile?.total_xp ?? 0}`} />
                <StatCard label="Streak" value={`${profile?.streak_days ?? 0} days`} />
                <StatCard label="Goal" value={`${profile?.daily_goal_minutes ?? 10} min`} />
              </View>
              <View style={styles.heroRow}>
                <StatCard label="Lessons" value={`${lessonProgress.size}`} />
                <StatCard label="Mastered" value={`${masteredLessonCount}`} />
                <StatCard label="Due cards" value={`${srsCards.length}`} />
              </View>
              <View style={styles.heroRow}>
                <StatCard label="Strongest skill" value={strongestSkill.key} />
                <StatCard label="Best lesson" value={`${bestLessonAccuracy}%`} />
                <StatCard label="Best session" value={`${bestSessionAccuracy}%`} />
              </View>
            </SectionCard>

            <SectionCard
              title="Next focus"
              eyebrow="Action plan"
              description="A small recommendation based on your current reviews, lessons, and skill balance."
            >
              <View style={styles.focusCard}>
                <Text style={styles.focusTitle}>{nextFocus.title}</Text>
                <Text style={styles.focusDescription}>{nextFocus.description}</Text>
                <View style={styles.pillRow}>
                  <Pill label={`Weakest: ${weakestSkill.key}`} />
                  <Pill label={`Strongest: ${strongestSkill.key}`} />
                  <Pill label={`${weeklyActiveDays} active days`} />
                </View>
              </View>
            </SectionCard>

            <SectionCard
              title="Skill mix"
              eyebrow="Learning balance"
              description="A quick look at where your current strength is concentrated."
            >
              {skills.map((skill) => (
                <View key={skill.key} style={styles.skillRow}>
                  <View style={styles.skillHeader}>
                    <Text style={styles.skillLabel}>{skill.key}</Text>
                    <Text style={styles.skillValue}>{skill.value}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${skill.value}%`, backgroundColor: skill.tone },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </SectionCard>
          </>
        ) : null}

        <TabBar activeTab={currentNavTab} onHome={handleGoHome} onLessons={handleGoLessons} onReview={handleGoReview} onJournal={handleGoJournal} onProgress={handleGoProgress} />
      </ScrollView>
    </SafeAreaView>
  );
}

function CenteredNotice({
  title,
  description,
  loading = false,
}: {
  title: string;
  description: string;
  loading?: boolean;
}) {
  return (
    <View style={styles.centeredNotice}>
      {loading ? <ActivityIndicator color="#BFD0FF" /> : null}
      <Text style={styles.centeredNoticeTitle}>{title}</Text>
      <Text style={styles.centeredNoticeDescription}>{description}</Text>
    </View>
  );
}

function InfoBanner({ text }: { text: string }) {
  return (
    <View style={styles.infoBanner}>
      <Text style={styles.infoBannerText}>{text}</Text>
    </View>
  );
}

function LabeledInput({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#7282A6"
        style={styles.input}
        {...props}
      />
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choiceChip, selected && styles.choiceChipSelected]}
    >
      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.primaryButtonDisabled,
        pressed && !disabled && styles.primaryButtonPressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDescription}>{description}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function TabBar({
  activeTab,
  onHome,
  onLessons,
  onReview,
  onJournal,
  onProgress,
}: {
  activeTab: NavTab;
  onHome: () => void;
  onLessons: () => void;
  onReview: () => void;
  onJournal: () => void;
  onProgress: () => void;
}) {
  return (
    <View style={styles.tabBar}>
      <TabButton label="Dashboard" active={activeTab === "dashboard"} onPress={onHome} />
      <TabButton label="Lessons" active={activeTab === "lessons"} onPress={onLessons} />
      <TabButton label="Review" active={activeTab === "review"} onPress={onReview} />
      <TabButton label="Journal" active={activeTab === "journal"} onPress={onJournal} />
      <TabButton label="Progress" active={activeTab === "progress"} onPress={onProgress} />
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
    >
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0E1726",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
    backgroundColor: "#0E1726",
  },
  centeredNotice: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#0E1726",
  },
  centeredNoticeTitle: {
    color: "#F6F9FF",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  centeredNoticeDescription: {
    color: "#A9B7D1",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  infoBanner: {
    backgroundColor: "#162640",
    borderColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  infoBannerText: {
    color: "#DDE6F6",
    fontSize: 14,
    lineHeight: 20,
  },
  hero: {
    backgroundColor: "#13233D",
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(76,125,255,0.16)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  badgeText: {
    color: "#BFD0FF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  connectionPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(42,157,143,0.15)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 18,
  },
  connectionPillText: {
    color: "#BDF0E6",
    fontSize: 12,
    fontWeight: "700",
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  profileAvatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(76,125,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(76,125,255,0.28)",
  },
  profileAvatarText: {
    color: "#EEF4FF",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  profileHeaderContent: {
    flex: 1,
    gap: 5,
  },
  profileHeaderName: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  profileHeaderMeta: {
    color: "#AEB9D2",
    fontSize: 13,
    lineHeight: 18,
  },
  profileHeaderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  profileBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(42,157,143,0.15)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(42,157,143,0.25)",
  },
  profileBadgeText: {
    color: "#BDF0E6",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  profileBadgeSoft: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  profileBadgeSoftText: {
    color: "#D4DDF2",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  title: {
    color: "#F6F9FF",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    marginBottom: 10,
  },
  subtitle: {
    color: "#A9B7D1",
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 18,
  },
  heroRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#182947",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statLabel: {
    color: "#95A6C7",
    fontSize: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#101B2E",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  eyebrow: {
    color: "#7F97C7",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontSize: 11,
    marginBottom: 8,
    fontWeight: "700",
  },
  cardTitle: {
    color: "#F7FAFF",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  cardDescription: {
    color: "#9AAAC6",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  cardBody: {
    gap: 12,
  },
  reviewSummaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  weekSummaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  streakSummaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  weekChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingTop: 4,
  },
  weekChartDay: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  weekBarTrack: {
    width: "100%",
    height: 140,
    borderRadius: 18,
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 8,
    justifyContent: "flex-end",
  },
  weekBarFill: {
    width: "100%",
    borderRadius: 12,
  },
  weekBarActive: {
    backgroundColor: "#4C7DFF",
  },
  weekBarIdle: {
    backgroundColor: "#203457",
  },
  weekChartLabel: {
    color: "#EAF0FF",
    fontSize: 12,
    fontWeight: "700",
  },
  weekChartMeta: {
    color: "#9AAAC6",
    fontSize: 11,
    fontWeight: "700",
  },
  streakTrack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  streakDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  streakDotActive: {
    backgroundColor: "#2A9D8F",
    borderColor: "rgba(42,157,143,0.85)",
  },
  streakDotToday: {
    borderColor: "#F4A261",
    borderWidth: 2,
  },
  streakDotText: {
    color: "#9AAAC6",
    fontSize: 12,
    fontWeight: "800",
  },
  streakDotTextActive: {
    color: "#FFFFFF",
  },
  sessionRow: {
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  sessionRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sessionRowFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sessionRowTitle: {
    color: "#F6F9FF",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  sessionRowMeta: {
    color: "#9FB0D1",
    fontSize: 12,
    fontWeight: "700",
  },
  sessionRowNote: {
    color: "#D7E1F7",
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reflectionList: {
    gap: 10,
  },
  reflectionCard: {
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  reflectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  reflectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  reflectionHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  reflectionTitle: {
    color: "#F6F9FF",
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  reflectionMeta: {
    color: "#8FA2C8",
    fontSize: 12,
    fontWeight: "700",
  },
  reflectionBody: {
    color: "#DCE6FF",
    fontSize: 14,
    lineHeight: 20,
  },
  reflectionActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  reflectionActionButton: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(76,125,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(76,125,255,0.30)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reflectionActionButtonMuted: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  reflectionActionButtonPinned: {
    backgroundColor: "rgba(42,157,143,0.16)",
    borderColor: "rgba(42,157,143,0.30)",
  },
  reflectionActionButtonDanger: {
    backgroundColor: "rgba(244,162,97,0.14)",
    borderColor: "rgba(244,162,97,0.28)",
  },
  reflectionActionButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  reflectionActionButtonText: {
    color: "#F6F9FF",
    fontSize: 12,
    fontWeight: "800",
  },
  reflectionActionButtonTextMuted: {
    color: "#D4DDF2",
  },
  reflectionActionButtonTextPinned: {
    color: "#CFF6EF",
  },
  reflectionActionButtonTextDanger: {
    color: "#FFE7CC",
  },
  inlineLoaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  inlineLoaderText: {
    color: "#BFD0FF",
    fontSize: 14,
    fontWeight: "600",
  },
  form: {
    gap: 12,
  },
  field: {
    gap: 8,
  },
  label: {
    color: "#EAF0FF",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    color: "#F7FAFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    color: "#F7FAFF",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    minHeight: 96,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  choiceChip: {
    backgroundColor: "#162640",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  choiceChipSelected: {
    backgroundColor: "rgba(76,125,255,0.20)",
    borderColor: "rgba(76,125,255,0.65)",
  },
  choiceChipText: {
    color: "#C6D1E8",
    fontSize: 13,
    fontWeight: "700",
  },
  choiceChipTextSelected: {
    color: "#F6F9FF",
  },
  message: {
    color: "#DDE6F6",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: "#4C7DFF",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  inlineLink: {
    color: "#BFD0FF",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepIndex: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#203457",
  },
  stepIndexText: {
    color: "#E7ECF8",
    fontWeight: "700",
  },
  stepText: {
    color: "#D5DDF0",
    fontSize: 15,
    flex: 1,
  },
  lessonCard: {
    backgroundColor: "#162640",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    gap: 10,
  },
  lessonCardPressed: {
    transform: [{ scale: 0.99 }],
    borderColor: "rgba(76,125,255,0.45)",
  },
  lessonCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  lessonBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    flex: 1,
  },
  lessonBadge: {
    backgroundColor: "rgba(42,157,143,0.16)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lessonBadgeText: {
    color: "#BDF0E6",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  lessonStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  lessonStatusBadgeNew: {
    backgroundColor: "rgba(127,151,199,0.14)",
  },
  lessonStatusBadgeProgress: {
    backgroundColor: "rgba(244,162,97,0.14)",
    borderColor: "rgba(244,162,97,0.35)",
  },
  lessonStatusBadgeDone: {
    backgroundColor: "rgba(42,157,143,0.18)",
    borderColor: "rgba(42,157,143,0.4)",
  },
  lessonMasteryBadge: {
    borderStyle: "dashed",
  },
  lessonMasteryBadgeNew: {
    backgroundColor: "rgba(127,151,199,0.10)",
  },
  lessonMasteryBadgeProgress: {
    backgroundColor: "rgba(244,162,97,0.12)",
    borderColor: "rgba(244,162,97,0.34)",
  },
  lessonMasteryBadgeDone: {
    backgroundColor: "rgba(42,157,143,0.22)",
    borderColor: "rgba(42,157,143,0.44)",
  },
  lessonStatusText: {
    color: "#C6D1E8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  lessonStatusTextDone: {
    color: "#FFFFFF",
  },
  lessonMeta: {
    color: "#9FB0D1",
    fontSize: 12,
    fontWeight: "700",
  },
  lessonTitle: {
    color: "#F6F9FF",
    fontSize: 17,
    fontWeight: "800",
  },
  lessonDescription: {
    color: "#B7C4DF",
    fontSize: 14,
    lineHeight: 20,
  },
  lessonProgressMeta: {
    color: "#8FA2C8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  lessonStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lessonPrompt: {
    color: "#F6F9FF",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  reviewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  reviewAnswerBox: {
    backgroundColor: "#101B2E",
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  reviewAnswerLabel: {
    color: "#7F97C7",
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  reviewAnswerText: {
    color: "#F6F9FF",
    fontSize: 17,
    fontWeight: "800",
  },
  summaryBox: {
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  summaryBoxTitle: {
    color: "#F6F9FF",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  summaryBoxText: {
    color: "#B7C4DF",
    fontSize: 14,
    lineHeight: 20,
  },
  focusCard: {
    backgroundColor: "rgba(76,125,255,0.10)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(76,125,255,0.18)",
    padding: 16,
    gap: 10,
  },
  focusTitle: {
    color: "#F6F9FF",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  focusDescription: {
    color: "#C6D1E8",
    fontSize: 14,
    lineHeight: 20,
  },
  quizColumn: {
    gap: 10,
  },
  lessonHint: {
    color: "#A9B7D1",
    fontSize: 13,
    lineHeight: 19,
  },
  lessonTapLabel: {
    color: "#8FA2C8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  achievementList: {
    gap: 10,
  },
  achievementItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 18,
    padding: 14,
  },
  achievementItemUnlocked: {
    backgroundColor: "rgba(42,157,143,0.12)",
    borderColor: "rgba(42,157,143,0.28)",
  },
  achievementTextBlock: {
    flex: 1,
    gap: 4,
  },
  achievementTitle: {
    color: "#F6F9FF",
    fontSize: 15,
    fontWeight: "800",
  },
  achievementTitleUnlocked: {
    color: "#EFFFFA",
  },
  achievementDescription: {
    color: "#9AAAC6",
    fontSize: 13,
    lineHeight: 18,
  },
  achievementPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#203457",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  achievementPillUnlocked: {
    backgroundColor: "rgba(42,157,143,0.22)",
    borderColor: "rgba(42,157,143,0.45)",
  },
  achievementPillText: {
    color: "#C6D1E8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  achievementPillTextUnlocked: {
    color: "#FFFFFF",
  },
  spotlightCard: {
    backgroundColor: "rgba(76,125,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(76,125,255,0.22)",
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  spotlightBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(244,162,97,0.18)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  spotlightBadgeText: {
    color: "#FFE7CC",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  spotlightTitle: {
    color: "#F6F9FF",
    fontSize: 18,
    fontWeight: "800",
  },
  spotlightDescription: {
    color: "#DCE6FF",
    fontSize: 14,
    lineHeight: 20,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#162640",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: "rgba(76,125,255,0.18)",
    borderColor: "rgba(76,125,255,0.72)",
  },
  filterChipText: {
    color: "#D3DCF1",
    fontSize: 13,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: "#F6F9FF",
  },
  filterChipCount: {
    color: "#8FA2C8",
    fontSize: 12,
    fontWeight: "800",
  },
  filterChipCountActive: {
    color: "#DCE6FF",
  },
  skillRow: {
    gap: 8,
  },
  skillHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skillLabel: {
    color: "#EAF0FF",
    fontSize: 14,
    fontWeight: "600",
  },
  skillValue: {
    color: "#A9B7D1",
    fontSize: 14,
    fontWeight: "700",
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#1B2942",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pill: {
    backgroundColor: "#1A2740",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillText: {
    color: "#D3DCF1",
    fontSize: 13,
    fontWeight: "600",
  },
  tabBar: {
    flexDirection: "row",
    gap: 10,
    padding: 10,
    marginTop: 4,
    backgroundColor: "#101B2E",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#162640",
  },
  tabButtonActive: {
    backgroundColor: "#4C7DFF",
  },
  tabButtonText: {
    color: "#C6D1E8",
    fontSize: 13,
    fontWeight: "800",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },
});
