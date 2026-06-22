import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { Session } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();
import { isSupabaseConfigured, supabase } from "./src/lib/supabase";
import {
  getLessonContent,
  lessonSteps,
  placementQuestions,
  type LessonContent,
  type LearnNote,
  type QuizQuestion,
} from "./src/content/lessonContent";
import LessonVideo from "./src/components/LessonVideo";
import SingAlong from "./src/components/SingAlong";
import { grammarRules } from "./src/content/grammarOverview";
import { getWeeklySong, weeklySongs, type WeeklySong } from "./src/content/weeklySongs";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  target_language: string;
  cefr_level: string;
  placement_level: string;
  placement_answers:
    | Array<{
        prompt: string;
        selected_index: number | null;
        correct_index: number;
      }>
    | null;
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
  content_key: string | null;
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

type SyncQueueItem =
  | {
      id: string;
      kind: "profile_update";
      payload: {
        total_xp: number;
        streak_days: number;
      };
    }
  | {
      id: string;
      kind: "session_log";
      payload: {
        lesson_id: string | null;
        duration_seconds: number;
        accuracy: number | null;
        hint_usage: number;
        note: string | null;
      };
    }
  | {
      id: string;
      kind: "srs_card_update";
      payload: {
        card_id: string;
        srs_stage: number;
        due_at: string;
        last_reviewed_at: string;
      };
    };

type LessonPage =
  | { kind: "intro" }
  | { kind: "note"; note: LearnNote; index: number; total: number }
  | { kind: "quiz"; question: QuizQuestion; index: number; total: number }
  | { kind: "history" }
  | { kind: "complete" };

function buildLessonPages(content: LessonContent): LessonPage[] {
  const pages: LessonPage[] = [{ kind: "intro" }];
  content.learnNotes.forEach((note, index) => {
    pages.push({ kind: "note", note, index, total: content.learnNotes.length });
  });
  content.quiz.forEach((question, index) => {
    pages.push({ kind: "quiz", question, index, total: content.quiz.length });
  });
  pages.push({ kind: "history" });
  pages.push({ kind: "complete" });
  return pages;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const SERIF_FONT = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });
const DASHBOARD_TAB_ORDER: NavTab[] = ["dashboard", "lessons", "review", "journal", "progress"];

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
type Screen = "auth" | "dashboard" | "lesson" | "review" | "summary" | "song" | "grammar";
type NavTab = "dashboard" | "lessons" | "review" | "journal" | "progress";
type JournalSort = "newest" | "oldest";
type JournalTag = "all" | "grammar" | "vocabulary" | "speaking" | "listening" | "review";
type LessonFilter = "all" | "grammar" | "vocabulary" | "listening" | "speaking";

const skills: Skill[] = [
  { key: "Reading", value: 68, tone: "#E8B563" },
  { key: "Writing", value: 54, tone: "#F4A261" },
  { key: "Listening", value: 61, tone: "#2A9D8F" },
  { key: "Speaking", value: 47, tone: "#E76F51" },
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

function getLessonsCacheKey(userId: string) {
  return `language-helper:lessons:${userId}`;
}

function getSrsCacheKey(userId: string) {
  return `language-helper:srs:${userId}`;
}

async function readCachedLessons(userId: string): Promise<Lesson[] | null> {
  try {
    const raw = await AsyncStorage.getItem(getLessonsCacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as Lesson[];
  } catch {
    return null;
  }
}

async function writeCachedLessons(userId: string, lessons: Lesson[]) {
  try {
    await AsyncStorage.setItem(getLessonsCacheKey(userId), JSON.stringify(lessons));
  } catch {
    // Cache writes are best effort.
  }
}

async function readCachedSrsCards(userId: string): Promise<SrsCard[] | null> {
  try {
    const raw = await AsyncStorage.getItem(getSrsCacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as SrsCard[];
  } catch {
    return null;
  }
}

async function writeCachedSrsCards(userId: string, cards: SrsCard[]) {
  try {
    await AsyncStorage.setItem(getSrsCacheKey(userId), JSON.stringify(cards));
  } catch {
    // Cache writes are best effort.
  }
}

function getSyncQueueKey(userId: string) {
  return `language-helper:sync:${userId}`;
}

async function readCachedSyncQueue(userId: string): Promise<SyncQueueItem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(getSyncQueueKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as SyncQueueItem[];
  } catch {
    return null;
  }
}

async function writeCachedSyncQueue(userId: string, queue: SyncQueueItem[]) {
  try {
    await AsyncStorage.setItem(getSyncQueueKey(userId), JSON.stringify(queue));
  } catch {
    // Cache writes are best effort.
  }
}

function createSyncQueueId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getGermanTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "Guten\nMorgen.";
  if (hour < 17) return "Guten\nTag.";
  return "Guten\nAbend.";
}

function getSyncStatusLabel(queueCount: number) {
  if (!isSupabaseConfigured) {
    return "Connect Supabase to sync";
  }

  if (queueCount > 0) {
    return `${queueCount} action${queueCount === 1 ? "" : "s"} waiting to sync`;
  }

  return "Synced to Supabase";
}

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

function getPlacementRecommendation(score: number): (typeof placementChoices)[number] {
  if (score <= 1) return "A1";
  if (score === 2) return "A2";
  if (score === 3) return "B1";
  return "B2";
}

function buildPlacementAnswersPayload(answers: Array<number | null>) {
  return placementQuestions.map((question, index) => ({
    prompt: question.prompt,
    selected_index: answers[index] ?? null,
    correct_index: question.correctIndex,
  }));
}

function readPlacementAnswers(
  payload:
    | Array<{
        prompt: string;
        selected_index: number | null;
        correct_index: number;
      }>
    | null
) {
  return placementQuestions.map((_, index) => payload?.[index]?.selected_index ?? null);
}

function getPlacementWeakness(answers: Array<number | null>): LessonFilter {
  const counts = new Map<LessonFilter, number>();

  placementQuestions.forEach((question, index) => {
    if (answers[index] === question.correctIndex) return;

    counts.set(question.focus, (counts.get(question.focus) ?? 0) + 1);
  });

  const ranked = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  return ranked[0]?.[0] ?? "grammar";
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

function getLessonFollowUp(
  lessonResult: LessonResult | null,
  lessons: Lesson[]
) {
  if (!lessonResult || lessons.length === 0) {
    return null;
  }

  const sameTrackLessons = lessons.filter(
    (lesson) => lesson.cefr_level === lessonResult.lesson.cefr_level
  );

  if (lessonResult.correct) {
    return (
      sameTrackLessons.find(
        (lesson) => lesson.sort_order > lessonResult.lesson.sort_order
      ) ??
      sameTrackLessons[0] ??
      lessons[0] ??
      null
    );
  }

  return lessonResult.lesson;
}

function getLessonSkipAheadOption(
  lessonResult: LessonResult | null,
  lessons: Lesson[]
) {
  if (!lessonResult || lessons.length === 0 || lessonResult.accuracy < 90) {
    return null;
  }

  const sameTrackLessons = lessons.filter(
    (lesson) => lesson.cefr_level === lessonResult.lesson.cefr_level
  );
  const ahead = sameTrackLessons.filter(
    (lesson) => lesson.sort_order > lessonResult.lesson.sort_order
  );

  // The lesson two spots ahead - i.e. the one reachable by skipping one.
  return ahead[1] ?? null;
}

function buildHandoffNotice(
  lessonResult: LessonResult | null,
  nextLesson: Lesson | null
) {
  if (!lessonResult || !nextLesson) {
    return null;
  }

  if (nextLesson.id === lessonResult.lesson.id) {
    return `Refresh: ${nextLesson.title}.`;
  }

  if (lessonResult.correct) {
    return `Up next: ${nextLesson.title}.`;
  }

  return `Retry: ${nextLesson.title}.`;
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
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<(typeof placementChoices)[number]>("A1");
  const [placementAnswers, setPlacementAnswers] = useState<Array<number | null>>(
    () => Array.from({ length: placementQuestions.length }, () => null)
  );
  const [placementLevelLocked, setPlacementLevelLocked] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState("10");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonsError, setLessonsError] = useState<string | null>(null);
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>("all");
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [pendingLessonFocus, setPendingLessonFocus] = useState<LessonFilter | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const lessonPagerRef = useRef<ScrollView>(null);
  const dashboardPagerRef = useRef<ScrollView>(null);
  const [dashboardPageIndex, setDashboardPageIndex] = useState(0);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [showGrammarOverview, setShowGrammarOverview] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Array<number | null>>([]);

  useEffect(() => {
    if (activeLesson) {
      lessonPagerRef.current?.scrollTo({ x: pageIndex * SCREEN_WIDTH, animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLesson?.id]);
  const [lessonNote, setLessonNote] = useState("");
  const [lessonSaving, setLessonSaving] = useState(false);
  const [lessonResult, setLessonResult] = useState<LessonResult | null>(null);
  const [lastLessonResult, setLastLessonResult] = useState<LessonResult | null>(null);
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
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const syncQueueFlushingRef = useRef(false);
  const autoOpenSuggestedLessonRef = useRef(false);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const screen: Screen = !session
    ? "auth"
    : lessonResult
      ? "summary"
      : activeLesson
        ? "lesson"
        : activeReviewIndex !== null
          ? "review"
          : activeSongId
            ? "song"
            : showGrammarOverview
              ? "grammar"
              : "dashboard";
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
  const weeklyMinutes = weeklyActivity.reduce<number>(
    (sum, day) => sum + day.minutes,
    0
  );
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
  const syncStatusLabel = useMemo(
    () => getSyncStatusLabel(syncQueueCount),
    [syncQueueCount]
  );
  const placementScore = useMemo(
    () =>
      placementAnswers.reduce<number>(
        (sum, answer, index) =>
          sum + Number(answer === placementQuestions[index]?.correctIndex),
        0
      ),
    [placementAnswers]
  );
  const placementRecommendation = useMemo(
    () => getPlacementRecommendation(placementScore),
    [placementScore]
  );
  const placementWeakness = useMemo(
    () => getPlacementWeakness(placementAnswers),
    [placementAnswers]
  );
  const recommendedLesson = useMemo(
    () =>
      lessons.find((lesson) => getLessonFilter(lesson) === placementWeakness) ??
      lessons[0] ??
      null,
    [lessons, placementWeakness]
  );
  const lessonFollowUp = useMemo(
    () => getLessonFollowUp(lessonResult ?? lastLessonResult, lessons),
    [lessonResult, lastLessonResult, lessons]
  );
  const lessonSkipAhead = useMemo(
    () => getLessonSkipAheadOption(lessonResult ?? lastLessonResult, lessons),
    [lessonResult, lastLessonResult, lessons]
  );
  const dashboardLessonSuggestion = useMemo(
    () => lessonFollowUp ?? recommendedLesson,
    [lessonFollowUp, recommendedLesson]
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

  function resetJournalFilters() {
    setJournalQuery("");
    setJournalSort("newest");
    setJournalTag("all");
    setJournalPinnedOnly(false);
  }

  async function performSyncQueueItem(item: SyncQueueItem, userId: string) {
    if (!supabase) {
      return "Supabase is not configured yet.";
    }

    switch (item.kind) {
      case "profile_update": {
        const { error } = await supabase
          .from("profiles")
          .update({
            total_xp: item.payload.total_xp,
            streak_days: item.payload.streak_days,
          })
          .eq("id", userId);

        return error?.message ?? null;
      }
      case "session_log": {
        const { error } = await supabase.from("session_logs").insert({
          user_id: userId,
          lesson_id: item.payload.lesson_id,
          duration_seconds: item.payload.duration_seconds,
          accuracy: item.payload.accuracy,
          hint_usage: item.payload.hint_usage,
          note: item.payload.note,
        });

        return error?.message ?? null;
      }
      case "srs_card_update": {
        const { error } = await supabase
          .from("srs_cards")
          .update({
            srs_stage: item.payload.srs_stage,
            due_at: item.payload.due_at,
            last_reviewed_at: item.payload.last_reviewed_at,
          })
          .eq("id", item.payload.card_id)
          .eq("user_id", userId);

        return error?.message ?? null;
      }
      default:
        return "Unknown sync item.";
    }
  }

  async function flushSyncQueue(userId: string) {
    if (!supabase || syncQueueFlushingRef.current) return;

    syncQueueFlushingRef.current = true;
    try {
      let queue = (await readCachedSyncQueue(userId)) ?? [];

      while (queue.length > 0) {
        const errorMessage = await performSyncQueueItem(queue[0], userId);
        if (errorMessage) {
          setMessage(errorMessage);
          break;
        }

        queue = queue.slice(1);
        await writeCachedSyncQueue(userId, queue);
        setSyncQueueCount(queue.length);
      }
      setSyncQueueCount(queue.length);
    } finally {
      syncQueueFlushingRef.current = false;
    }
  }

  async function enqueueSyncItems(userId: string, items: SyncQueueItem[]) {
    const current = (await readCachedSyncQueue(userId)) ?? [];
    const next = [...current, ...items];
    await writeCachedSyncQueue(userId, next);
    setSyncQueueCount(next.length);
    await flushSyncQueue(userId);
  }

  async function handleManualSync() {
    if (!session?.user?.id) return;

    if (!supabase) {
      setMessage("Connect Supabase to sync queued changes.");
      return;
    }

    await flushSyncQueue(session.user.id);
    const queue = (await readCachedSyncQueue(session.user.id)) ?? [];
    setSyncQueueCount(queue.length);
    setMessage(
      queue.length > 0
        ? `${queue.length} action${queue.length === 1 ? "" : "s"} still waiting to sync.`
        : "Everything is synced."
    );
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
    const sub = Linking.addEventListener("url", ({ url }: { url: string }) => {
      createSessionFromUrl(url);
    });
    return () => sub.remove();
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
          "id,email,display_name,target_language,cefr_level,placement_level,placement_answers,daily_goal_minutes,onboarding_completed,streak_days,total_xp"
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
      setPlacementAnswers(readPlacementAnswers(data?.placement_answers ?? null));
      setPlacementLevelLocked(false);
      setDailyGoalMinutes(String(data?.daily_goal_minutes ?? 10));
    }

    loadProfile(session);

    return () => {
      mounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (!supabase || !session?.user || !profile) return;
    if (profile.onboarding_completed) return;

    const client = supabase;
    const userId = session.user.id;
    let cancelled = false;

    async function autoCompleteOnboarding() {
      const { error } = await client
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", userId);

      if (cancelled || error) return;

      const starterCards = [
        {
          user_id: userId,
          prompt: "What is the polite phrase for ordering coffee?",
          answer: "Guten Tag, ich haette gern Kaffee",
          srs_stage: 0,
          due_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          last_reviewed_at: null,
        },
        {
          user_id: userId,
          prompt: "Which article fits Brot in the accusative?",
          answer: "den Brot",
          srs_stage: 0,
          due_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          last_reviewed_at: null,
        },
      ];
      await client.from("srs_cards").insert(starterCards);

      if (cancelled) return;
      setProfile((current) =>
        current ? { ...current, onboarding_completed: true } : current
      );
    }

    autoCompleteOnboarding();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, profile?.onboarding_completed]);

  useEffect(() => {
    if (!session?.user?.id || !supabase) return;

    flushSyncQueue(session.user.id);
  }, [session?.user?.id, supabase]);

  useEffect(() => {
    if (!session?.user?.id) {
      setSyncQueueCount(0);
      setLastLessonResult(null);
      setHandoffNotice(null);
      return;
    }

    let mounted = true;

    async function loadSyncQueueCount(userId: string) {
      const queue = (await readCachedSyncQueue(userId)) ?? [];
      if (mounted) {
        setSyncQueueCount(queue.length);
      }
    }

    loadSyncQueueCount(session.user.id);

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!handoffNotice) return;

    const timer = setTimeout(() => {
      setHandoffNotice(null);
    }, 4000);

    return () => clearTimeout(timer);
  }, [handoffNotice]);

  useEffect(() => {
    let mounted = true;

    async function loadLessons(activeProfile: Profile | null) {
      if (!activeProfile?.id || !activeProfile?.cefr_level) {
        if (mounted) {
          setLessons([]);
          setLessonsError(null);
          setLessonsLoading(false);
        }
        return;
      }

      if (!supabase) {
        const cachedLessons = await readCachedLessons(activeProfile.id);
        if (!mounted) return;

        if (cachedLessons) {
          setLessons(cachedLessons);
          setLessonsError("Showing saved lessons while Supabase is unavailable.");
        } else {
          setLessons([]);
          setLessonsError("Supabase is unavailable and no cached lessons were found.");
        }

        setLessonsLoading(false);
        return;
      }

      setLessonsLoading(true);
      setLessonsError(null);

      const { data, error } = await supabase
        .from("lessons")
        .select("id,title,description,cefr_level,topic,content_key,estimated_minutes,sort_order")
        .eq("cefr_level", activeProfile.cefr_level)
        .order("sort_order", { ascending: true });

      if (!mounted) return;

      if (error) {
        const cachedLessons = await readCachedLessons(activeProfile.id);
        if (!mounted) return;

        if (cachedLessons) {
          setLessons(cachedLessons);
          setLessonsError("Showing cached lessons while Supabase is unavailable.");
        } else {
          setLessons([]);
          setLessonsError(error.message);
        }
        setLessonsLoading(false);
        return;
      }

      const nextLessons = (data ?? []) as Lesson[];
      setLessons(nextLessons);
      await writeCachedLessons(activeProfile.id, nextLessons);
      setLessonsLoading(false);
    }

    if (screen === "dashboard") {
      loadLessons(profile);
      return () => {
        mounted = false;
      };
    }

    if (screen === "auth") {
      setLessons([]);
      setLessonsError(null);
      setLessonsLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [profile, screen]);

  useEffect(() => {
    if (screen !== "dashboard" || lessons.length === 0) return;

    if (autoOpenSuggestedLessonRef.current && dashboardLessonSuggestion) {
      const notice = buildHandoffNotice(lastLessonResult, dashboardLessonSuggestion);
      if (notice) {
        setHandoffNotice(notice);
      }
      const timer = setTimeout(() => {
        autoOpenSuggestedLessonRef.current = false;
        handleOpenLesson(dashboardLessonSuggestion);
      }, 700);

      return () => clearTimeout(timer);
    }

    if (autoOpenSuggestedLessonRef.current) {
      const notice = buildHandoffNotice(lastLessonResult, dashboardLessonSuggestion);
      if (notice) {
        setHandoffNotice(notice);
      }
      return;
    }

    if (!pendingLessonFocus) return;

    const nextLesson =
      lessons.find((lesson) => getLessonFilter(lesson) === pendingLessonFocus) ??
      lessons[0] ??
      null;

    if (!nextLesson) return;

    setPendingLessonFocus(null);
    handleOpenLesson(nextLesson);
  }, [screen, pendingLessonFocus, lessons, dashboardLessonSuggestion]);

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
      if (!activeProfile?.id) {
        if (mounted) {
          setSrsCards([]);
          setSrsError(null);
          setSrsLoading(false);
        }
        return;
      }

      if (!supabase) {
        const cachedCards = await readCachedSrsCards(activeProfile.id);
        if (!mounted) return;

        if (cachedCards) {
          setSrsCards(cachedCards);
          setSrsError("Showing saved review cards while Supabase is unavailable.");
        } else {
          setSrsCards([]);
          setSrsError("Supabase is unavailable and no cached review cards were found.");
        }

        setSrsLoading(false);
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
        const cachedCards = await readCachedSrsCards(activeProfile.id);
        if (!mounted) return;

        if (cachedCards) {
          setSrsCards(cachedCards);
          setSrsError("Showing cached review cards while Supabase is unavailable.");
        } else {
          setSrsCards([]);
          setSrsError(error.message);
        }
        setSrsLoading(false);
        return;
      }

      const nextCards = (data ?? []) as SrsCard[];
      setSrsCards(nextCards);
      await writeCachedSrsCards(activeProfile.id, nextCards);
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

  async function createSessionFromUrl(url: string) {
    if (!supabase) return;
    const { params, errorCode } = QueryParams.getQueryParams(url);
    if (errorCode) {
      setMessage(errorCode);
      return;
    }
    const { access_token, refresh_token } = params;
    if (!access_token || !refresh_token) return;

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) {
      setMessage(error.message);
    }
  }

  async function handleGoogleSignIn() {
    if (!supabase) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    setSaving(true);
    setMessage(null);

    const redirectTo = makeRedirectUri();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      setSaving(false);
      setMessage(error?.message ?? "Could not start Google sign-in.");
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    setSaving(false);

    if (result.type === "success" && result.url) {
      await createSessionFromUrl(result.url);
    }
  }

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

  function handleOpenLesson(lesson: Lesson) {
    setActiveLesson(lesson);
    setPageIndex(0);
    setQuizAnswers(
      Array.from({ length: getLessonContent(lesson.content_key).quiz.length }, () => null)
    );
    setLessonNote("");
    setLessonHistoryQuery("");
    setMessage(null);
  }

  function handleCloseLesson() {
    setActiveLesson(null);
    setPageIndex(0);
    setQuizAnswers([]);
    setLessonNote("");
  }

  function goToDashboardPage(index: number) {
    const clamped = Math.max(0, Math.min(index, DASHBOARD_TAB_ORDER.length - 1));
    setDashboardPageIndex(clamped);
    setMainTab(DASHBOARD_TAB_ORDER[clamped]);
    dashboardPagerRef.current?.scrollTo({ x: clamped * SCREEN_WIDTH, animated: true });
  }

  function handleOpenSingAlong(songId: string) {
    setActiveSongId(songId);
    setMessage(null);
  }

  function handleCloseSingAlong() {
    setActiveSongId(null);
  }

  function handleOpenGrammarOverview() {
    setShowGrammarOverview(true);
    setMessage(null);
  }

  function handleCloseGrammarOverview() {
    setShowGrammarOverview(false);
  }

  async function handleAddSongVocabToReview(song: WeeklySong) {
    if (!supabase || !session?.user) {
      setMessage("Supabase is not ready yet.");
      return;
    }

    const existingPrompts = new Set(srsCards.map((card) => card.prompt));
    const newCards = song.vocabCards.filter(
      (card) => !existingPrompts.has(card.prompt)
    );

    if (newCards.length === 0) {
      setMessage("This week's words are already in your review queue.");
      return;
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("srs_cards")
      .insert(
        newCards.map((card) => ({
          user_id: session.user.id,
          prompt: card.prompt,
          answer: card.answer,
          srs_stage: 0,
          due_at: nowIso,
          last_reviewed_at: null,
        }))
      )
      .select();

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data) {
      setSrsCards((current) => [...current, ...(data as SrsCard[])]);
    }
    setMessage(`Added ${newCards.length} word${newCards.length === 1 ? "" : "s"} to your review queue.`);
  }

  function handleGoHome() {
    handleCloseLesson();
    handleCloseReview();
    handleCloseSummary();
    handleCloseSingAlong();
    handleCloseGrammarOverview();
    cancelEditingReflection();
    goToDashboardPage(0);
    setMessage(null);
  }

  function handleGoLessons() {
    handleCloseLesson();
    handleCloseReview();
    handleCloseSummary();
    handleCloseSingAlong();
    handleCloseGrammarOverview();
    cancelEditingReflection();
    goToDashboardPage(1);
    setMessage(null);
  }

  function handleGoReview() {
    handleCloseLesson();
    handleCloseSummary();
    handleCloseSingAlong();
    handleCloseGrammarOverview();
    cancelEditingReflection();
    goToDashboardPage(2);
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
    handleCloseSingAlong();
    handleCloseGrammarOverview();
    cancelEditingReflection();
    goToDashboardPage(3);
    setMessage(null);
  }

  function handleGoProgress() {
    handleCloseLesson();
    handleCloseReview();
    handleCloseSummary();
    handleCloseSingAlong();
    handleCloseGrammarOverview();
    cancelEditingReflection();
    goToDashboardPage(4);
    setMessage(null);
  }

  function handleCloseSummary(autoOpenNextLesson = false) {
    autoOpenSuggestedLessonRef.current = autoOpenNextLesson && Boolean(lessonResult);
    if (autoOpenNextLesson) {
      const notice = buildHandoffNotice(lessonResult, lessonFollowUp ?? recommendedLesson);
      if (notice) {
        setHandoffNotice(notice);
      }
    }
    setLessonResult(null);
    setQuizAnswers([]);
    setPageIndex(0);
    setActiveLesson(null);
  }

  function handlePracticeAgain() {
    if (!lessonResult) return;
    const content = getLessonContent(lessonResult.lesson.content_key);
    setActiveLesson(lessonResult.lesson);
    setLessonResult(null);
    setPageIndex(1 + content.learnNotes.length);
    setQuizAnswers(Array.from({ length: content.quiz.length }, () => null));
    setLessonNote("");
  }

  function handleContinueLesson() {
    if (!lessonFollowUp || !lessonResult) return;
    setLessonResult(null);
    handleOpenLesson(lessonFollowUp);
  }

  function handleSkipAheadLesson() {
    if (!lessonSkipAhead || !lessonResult) return;
    setLessonResult(null);
    handleOpenLesson(lessonSkipAhead);
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
    if (!session?.user || activeReviewIndex === null) {
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
    const lastReviewedAt = new Date().toISOString();

    setReviewSaving(true);
    setMessage(null);

    const reviewLogPayload = {
      lesson_id: null,
      duration_seconds: 60,
      accuracy: known ? 100 : 60,
      hint_usage: reviewRevealed ? 0 : 1,
      note: null,
    };

    const cardUpdatePayload = {
      card_id: card.id,
      srs_stage: nextStage,
      due_at: dueAt.toISOString(),
      last_reviewed_at: lastReviewedAt,
    };
    let queuedForSync = !supabase;

    if (supabase) {
      const [cardUpdateResult, reviewLogResult] = await Promise.all([
        supabase
          .from("srs_cards")
          .update({
            srs_stage: nextStage,
            due_at: dueAt.toISOString(),
            last_reviewed_at: lastReviewedAt,
          })
          .eq("id", card.id)
          .eq("user_id", session.user.id),
        supabase.from("session_logs").insert({
          user_id: session.user.id,
          ...reviewLogPayload,
        }),
      ]);

      if (cardUpdateResult.error) {
        queuedForSync = true;
        await enqueueSyncItems(session.user.id, [
          { id: createSyncQueueId(), kind: "srs_card_update", payload: cardUpdatePayload },
        ]);
      }

      if (reviewLogResult.error) {
        queuedForSync = true;
        await enqueueSyncItems(session.user.id, [
          { id: createSyncQueueId(), kind: "session_log", payload: reviewLogPayload },
        ]);
      }
    } else {
      await enqueueSyncItems(session.user.id, [
        { id: createSyncQueueId(), kind: "srs_card_update", payload: cardUpdatePayload },
        { id: createSyncQueueId(), kind: "session_log", payload: reviewLogPayload },
      ]);
    }

    setReviewSaving(false);

    const remaining = srsCards.filter((_, index) => index !== activeReviewIndex);
    setSrsCards(remaining);
    await writeCachedSrsCards(session.user.id, remaining);

    if (queuedForSync) {
      setMessage("Saved locally and queued for sync.");
    }

    if (remaining.length === 0) {
      handleCloseReview();
      setMessage(
        queuedForSync
          ? "Saved locally and queued for sync. Review complete for now."
          : "Review complete for now."
      );
      return;
    }

    setActiveReviewIndex(0);
    setReviewRevealed(false);
  }

  async function handleCompleteLesson() {
    if (!session?.user || !activeLesson) {
      setMessage("Supabase is not ready yet.");
      return;
    }

    const content = getLessonContent(activeLesson.content_key);

    if (quizAnswers.some((answer) => answer === null)) {
      setMessage("Answer every question before completing the lesson.");
      return;
    }

    const correctCount = content.quiz.reduce(
      (count, question, index) =>
        count + (quizAnswers[index] === question.correctIndex ? 1 : 0),
      0
    );
    const accuracy =
      content.quiz.length > 0
        ? Math.round((correctCount / content.quiz.length) * 100)
        : 0;
    const isCorrect = accuracy >= 80;
    const xpEarned = isCorrect ? 25 : 10;
    const nextTotalXp = (profile?.total_xp ?? 0) + xpEarned;
    const nextStreakDays = (profile?.streak_days ?? 0) + 1;

    setLessonSaving(true);
    setMessage(null);

    const sessionLogPayload = {
      lesson_id: activeLesson.id,
      duration_seconds: activeLesson.estimated_minutes * 60,
      accuracy,
      hint_usage: 0,
      note: lessonNote.trim() || null,
    };

    const profileUpdatePayload = {
      total_xp: nextTotalXp,
      streak_days: nextStreakDays,
    };
    let queuedForSync = !supabase;

    if (supabase) {
      const [sessionLogResult, profileUpdateResult] = await Promise.all([
        supabase.from("session_logs").insert({
          user_id: session.user.id,
          ...sessionLogPayload,
        }),
        supabase
          .from("profiles")
          .update(profileUpdatePayload)
          .eq("id", session.user.id),
      ]);

      if (sessionLogResult.error) {
        queuedForSync = true;
        await enqueueSyncItems(session.user.id, [
          { id: createSyncQueueId(), kind: "session_log", payload: sessionLogPayload },
        ]);
      }

      if (profileUpdateResult.error) {
        queuedForSync = true;
        await enqueueSyncItems(session.user.id, [
          { id: createSyncQueueId(), kind: "profile_update", payload: profileUpdatePayload },
        ]);
      }
    } else {
      await enqueueSyncItems(session.user.id, [
        { id: createSyncQueueId(), kind: "session_log", payload: sessionLogPayload },
        { id: createSyncQueueId(), kind: "profile_update", payload: profileUpdatePayload },
      ]);
    }

    setLessonSaving(false);

    setProfile((current) =>
      current
        ? {
            ...current,
            total_xp: nextTotalXp,
            streak_days: nextStreakDays,
        }
        : current
    );
    setLessonResult({
      lesson: activeLesson,
      correct: isCorrect,
      xpEarned,
      accuracy,
    });
    setLastLessonResult({
      lesson: activeLesson,
      correct: isCorrect,
      xpEarned,
      accuracy,
    });
    if (queuedForSync) {
      setMessage("Saved locally and queued for sync.");
    }
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
        placement_answers: buildPlacementAnswersPayload(placementAnswers),
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
            placement_answers: buildPlacementAnswersPayload(placementAnswers),
            daily_goal_minutes: minutes,
          }
        : current
    );
    setMessage("Profile updated.");
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setLastLessonResult(null);
    setHandoffNotice(null);
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
          <Skyline />

          <View style={styles.hero}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>A1 · German</Text>
            </View>
            <Text style={styles.title}>{getGermanTimeGreeting()}</Text>
            <Text style={styles.subtitle}>
              Ten minutes a day, taught the way a patient teacher would, not a
              quiz app.
            </Text>
          </View>

          <View style={styles.form}>
            <Pressable
              onPress={handleGoogleSignIn}
              disabled={saving}
              style={({ pressed }) => [
                styles.socialButton,
                styles.socialButtonGoogle,
                pressed && styles.socialButtonPressed,
              ]}
            >
              <Text style={styles.socialButtonTextGoogle}>
                Continue with Google
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                setMessage("Apple sign-in is coming soon - use Google or email for now.")
              }
              style={({ pressed }) => [
                styles.socialButton,
                styles.socialButtonApple,
                pressed && styles.socialButtonPressed,
              ]}
            >
              <Text style={styles.socialButtonTextApple}>
                Continue with Apple
              </Text>
            </Pressable>

            {!showEmailForm ? (
              <Pressable onPress={() => setShowEmailForm(true)}>
                <Text style={styles.inlineLink}>Continue with email</Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Text style={styles.cardTitle}>
                  {authMode === "sign-in" ? "Welcome back" : "Create your account"}
                </Text>

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
              </>
            )}

            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "lesson" && activeLesson) {
    const content = getLessonContent(activeLesson.content_key);
    const pages = buildLessonPages(content);
    const safePageIndex = Math.min(pageIndex, pages.length - 1);

    function goToPage(targetIndex: number) {
      const clamped = Math.max(0, Math.min(targetIndex, pages.length - 1));
      setPageIndex(clamped);
      lessonPagerRef.current?.scrollTo({ x: clamped * SCREEN_WIDTH, animated: true });
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <View style={styles.bookHeader}>
          <View style={styles.bookHeaderTopRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeLesson.cefr_level}</Text>
            </View>
            <Pressable onPress={handleCloseLesson}>
              <Text style={styles.inlineLink}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>{activeLesson.title}</Text>
          <View style={styles.bookDotsRow}>
            {pages.map((page, index) => (
              <View
                key={`dot-${page.kind}-${index}`}
                style={[
                  styles.bookDot,
                  index === safePageIndex && styles.bookDotActive,
                ]}
              />
            ))}
          </View>
          <Text style={styles.bookPageLabel}>
            Page {safePageIndex + 1} of {pages.length} · swipe to turn the page
          </Text>
        </View>

        <ScrollView
          ref={lessonPagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: safePageIndex * SCREEN_WIDTH, y: 0 }}
          onMomentumScrollEnd={(event) => {
            const newIndex = Math.round(
              event.nativeEvent.contentOffset.x / SCREEN_WIDTH
            );
            setPageIndex(newIndex);
          }}
          style={styles.bookPager}
        >
          {pages.map((page, index) => (
            <View
              key={`page-${page.kind}-${index}`}
              style={[styles.bookPage, { width: SCREEN_WIDTH }]}
            >
              <ScrollView contentContainerStyle={styles.bookPageContent}>
                {page.kind === "intro" ? (
                  <>
                    <Text style={styles.eyebrow}>Watch & learn</Text>
                    <Text style={styles.cardDescription}>
                      {activeLesson.description ?? activeLesson.topic}
                    </Text>
                    {handoffNotice ? (
                      <Text style={styles.cardDescription}>{handoffNotice}</Text>
                    ) : null}
                    <Text style={styles.cardDescription}>{content.learnIntro}</Text>
                    <LessonVideo videoId={content.videoId} title={content.videoTitle} />
                  </>
                ) : null}

                {page.kind === "note" ? (
                  <>
                    <Text style={styles.eyebrow}>
                      Watch & learn · note {page.index + 1} of {page.total}
                    </Text>
                    <View style={styles.learnNoteCard}>
                      <Text style={styles.learnNoteHeading}>{page.note.heading}</Text>
                      <Text style={styles.learnNoteBody}>{page.note.body}</Text>
                    </View>
                  </>
                ) : null}

                {page.kind === "quiz" ? (
                  <>
                    <Text style={styles.eyebrow}>
                      Practice · question {page.index + 1} of {page.total}
                    </Text>
                    <Text style={styles.lessonPrompt}>{page.question.prompt}</Text>
                    <View style={styles.quizColumn}>
                      {page.question.options.map((option, optionIndex) => (
                        <ChoiceChip
                          key={option}
                          label={option}
                          selected={quizAnswers[page.index] === optionIndex}
                          onPress={() =>
                            setQuizAnswers((current) =>
                              current.map((answer, i) =>
                                i === page.index ? optionIndex : answer
                              )
                            )
                          }
                        />
                      ))}
                    </View>
                    <Text style={styles.lessonHint}>Hint: {page.question.hint}</Text>
                  </>
                ) : null}

                {page.kind === "history" ? (
                  <>
                    <Text style={styles.eyebrow}>Your history with this lesson</Text>
                    <View style={styles.field}>
                      <Text style={styles.label}>Search lesson history</Text>
                      <TextInput
                        value={lessonHistoryQuery}
                        onChangeText={setLessonHistoryQuery}
                        placeholder="Search notes from this lesson"
                        placeholderTextColor="#8A7E6C"
                        style={styles.input}
                      />
                    </View>
                    {lessonHistoryLoading ? (
                      <View style={styles.inlineLoaderRow}>
                        <ActivityIndicator color="#F0C988" />
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
                                  placeholderTextColor="#8A7E6C"
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
                  </>
                ) : null}

                {page.kind === "complete" ? (
                  <>
                    <Text style={styles.eyebrow}>Wrap up</Text>
                    <View style={styles.field}>
                      <Text style={styles.label}>Session note</Text>
                      <TextInput
                        value={lessonNote}
                        onChangeText={setLessonNote}
                        placeholder="What felt tricky or worth remembering?"
                        placeholderTextColor="#8A7E6C"
                        style={styles.textArea}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                      />
                    </View>
                    {message ? <InfoBanner text={message} /> : null}
                    <PrimaryButton
                      label={lessonSaving ? "Saving lesson..." : "Complete lesson"}
                      onPress={handleCompleteLesson}
                      disabled={lessonSaving || quizAnswers.some((answer) => answer === null)}
                    />
                  </>
                ) : null}
              </ScrollView>
            </View>
          ))}
        </ScrollView>

        <View style={styles.bookNavRow}>
          {safePageIndex > 0 ? (
            <Pressable
              onPress={() => goToPage(safePageIndex - 1)}
              style={({ pressed }) => [
                styles.bookNavButton,
                pressed && styles.bookNavButtonPressed,
              ]}
            >
              <Text style={styles.bookNavButtonText}>‹ Back</Text>
            </Pressable>
          ) : (
            <View style={styles.bookNavButton} />
          )}
          {safePageIndex < pages.length - 1 ? (
            <Pressable
              onPress={() => goToPage(safePageIndex + 1)}
              style={({ pressed }) => [
                styles.bookNavButton,
                styles.bookNavButtonPrimary,
                pressed && styles.bookNavButtonPressed,
              ]}
            >
              <Text style={[styles.bookNavButtonText, styles.bookNavButtonTextPrimary]}>
                Next ›
              </Text>
            </Pressable>
          ) : (
            <View style={styles.bookNavButton} />
          )}
        </View>

        <TabBar activeTab={currentNavTab} onHome={handleGoHome} onLessons={handleGoLessons} onReview={handleGoReview} onJournal={handleGoJournal} onProgress={handleGoProgress} />
      </SafeAreaView>
    );
  }

  if (screen === "grammar") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <View style={styles.bookHeaderTopRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Reference</Text>
              </View>
              <Pressable onPress={handleCloseGrammarOverview}>
                <Text style={styles.inlineLink}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.title}>Grammar overview</Text>
            <Text style={styles.subtitle}>
              Every grammar rule taught so far, collected in one place to flip
              back to.
            </Text>
          </View>

          {grammarRules.map((rule) => (
            <SectionCard
              key={rule.id}
              title={rule.title}
              eyebrow={`From: ${rule.fromLesson}`}
              description={rule.summary}
            >
              <View style={styles.learnNoteCard}>
                <Text style={styles.learnNoteHeading}>Example</Text>
                <Text style={styles.learnNoteBody}>{rule.example}</Text>
              </View>
            </SectionCard>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "song" && activeSongId) {
    const song = getWeeklySong(activeSongId);

    if (!song) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <CenteredNotice
            title="Song not found"
            description="This song isn't available yet."
          />
          <PrimaryButton label="Back to dashboard" onPress={handleCloseSingAlong} />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <ExpoStatusBar style="light" />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <View style={styles.bookHeaderTopRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{song.weekLabel} · {song.level}</Text>
              </View>
              <Pressable onPress={handleCloseSingAlong}>
                <Text style={styles.inlineLink}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.title}>{song.title}</Text>
            <Text style={styles.subtitle}>{song.description}</Text>
          </View>

          <SingAlong song={song} />

          <SectionCard
            title={song.culturalNote.title}
            eyebrow="Cultural note"
            description={song.culturalNote.body}
          />

          <PrimaryButton
            label="Add this week's words to review"
            onPress={() => handleAddSongVocabToReview(song)}
          />
          {message ? <InfoBanner text={message} /> : null}
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
            <View style={styles.bookHeaderTopRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Review</Text>
              </View>
              <Pressable onPress={handleSignOut}>
                <Text style={styles.inlineLink}>Sign out</Text>
              </Pressable>
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
                <ActivityIndicator color="#F0C988" />
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
            <View style={styles.bookHeaderTopRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {lessonResult.correct ? "Completed" : "Needs review"}
                </Text>
              </View>
              <Pressable onPress={handleSignOut}>
                <Text style={styles.inlineLink}>Sign out</Text>
              </Pressable>
            </View>
            <Text style={styles.title}>Lesson summary</Text>
            <Text style={styles.subtitle}>
              {lessonResult.lesson.title} is logged and your progress has been
              saved.
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

          <SectionCard
            title="Next step"
            eyebrow="Adaptive path"
            description="Your result helps pick the next lesson or a repeat pass."
          >
            <Text style={styles.summaryBoxTitle}>
              {lessonSkipAhead
                ? `Great score - you've unlocked two lessons ahead.`
                : lessonFollowUp && lessonFollowUp.id !== lessonResult.lesson.id
                  ? `Continue with ${lessonFollowUp.title}.`
                  : "Repeat this lesson once more to lock it in."}
            </Text>
            <Text style={styles.summaryBoxText}>
              {lessonSkipAhead
                ? `Scoring 90% or higher unlocks an extra lesson. Continue normally with ${lessonFollowUp?.title ?? "the next lesson"}, or skip ahead to ${lessonSkipAhead.title} if you're feeling confident.`
                : lessonResult.correct
                  ? "You answered correctly, so the app is nudging you forward to the next lesson in this CEFR track."
                  : "A repeat gives you one more pass at the same material before moving on."}
            </Text>
          </SectionCard>

          <View style={styles.heroRow}>
            <PrimaryButton
              label="Back to dashboard"
              onPress={() => handleCloseSummary(true)}
            />
            <PrimaryButton
              label={
                lessonFollowUp && lessonFollowUp.id !== lessonResult.lesson.id
                  ? `Continue to ${lessonFollowUp.title}`
                  : "Practice again"
              }
              onPress={
                lessonFollowUp && lessonFollowUp.id !== lessonResult.lesson.id
                  ? handleContinueLesson
                  : handlePracticeAgain
              }
            />
          </View>
          {lessonSkipAhead ? (
            <Pressable onPress={handleSkipAheadLesson}>
              <Text style={styles.inlineLink}>
                Skip ahead to {lessonSkipAhead.title} instead
              </Text>
            </Pressable>
          ) : null}
          <TabBar activeTab={currentNavTab} onHome={handleGoHome} onLessons={handleGoLessons} onReview={handleGoReview} onJournal={handleGoJournal} onProgress={handleGoProgress} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ExpoStatusBar style="light" />
      <View style={styles.bookHeader}>
        <View style={styles.bookHeaderTopRow}>
          <Text style={styles.bookHeaderBrand} numberOfLines={1}>Language Helper</Text>
          <Pressable onPress={handleSignOut}>
            <Text style={styles.inlineLink}>Sign out</Text>
          </Pressable>
        </View>
        <View style={styles.bookDotsRow}>
          {DASHBOARD_TAB_ORDER.map((tab, index) => (
            <View
              key={tab}
              style={[
                styles.bookDot,
                index === dashboardPageIndex && styles.bookDotActive,
              ]}
            />
          ))}
        </View>
      </View>

      <ScrollView
        ref={dashboardPagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: dashboardPageIndex * SCREEN_WIDTH, y: 0 }}
        onMomentumScrollEnd={(event) => {
          const newIndex = Math.round(
            event.nativeEvent.contentOffset.x / SCREEN_WIDTH
          );
          const clamped = Math.max(0, Math.min(newIndex, DASHBOARD_TAB_ORDER.length - 1));
          setDashboardPageIndex(clamped);
          setMainTab(DASHBOARD_TAB_ORDER[clamped]);
        }}
        style={styles.bookPager}
      >
          <View style={[styles.bookPage, { width: SCREEN_WIDTH }]}>
            <ScrollView contentContainerStyle={styles.bookPageContent}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Signed in</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>Willkommen, {greeting}</Text>
          <Text style={styles.subtitle}>
            Connected and ready for your lesson, streak, and review queue.
          </Text>
          <View style={styles.connectionPill}>
            <Text style={styles.connectionPillText}>
              {profile?.cefr_level ?? "A1"} learning path
            </Text>
          </View>
        </View>

        {message ? <InfoBanner text={message} /> : null}

        <SectionCard
          title="Your stats"
          eyebrow="Overview"
          description="A quick look at your streak, XP, and daily goal."
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
          title="Your book so far"
          eyebrow="At a glance"
          description="Tap any page to jump back into that lesson."
        >
          <View style={styles.tocList}>
            {lessons.slice(0, 6).map((lesson, index) => (
              <Pressable
                key={lesson.id}
                onPress={() => handleOpenLesson(lesson)}
                style={({ pressed }) => [
                  styles.tocRow,
                  pressed && styles.tocRowPressed,
                ]}
              >
                <Text style={styles.tocTitle} numberOfLines={1}>
                  {lesson.title}
                </Text>
                <View style={styles.tocDots} />
                <Text style={styles.tocPage}>
                  {String(index + 1).padStart(2, "0")}
                </Text>
              </Pressable>
            ))}
            {lessons.length === 0 ? (
              <Text style={styles.cardDescription}>
                No lessons yet - add some in Supabase to fill this page.
              </Text>
            ) : null}
          </View>
        </SectionCard>

        <SectionCard
          title="This week's song"
          eyebrow="Sing along"
          description={weeklySongs[0]?.description ?? "A short song to lock in this week's words."}
        >
          <Pressable onPress={() => handleOpenSingAlong(weeklySongs[0]?.id ?? "")}>
            <View style={styles.journalCard}>
              <View style={styles.journalCardFold} />
              <Text style={styles.journalEyebrow}>{weeklySongs[0]?.weekLabel ?? "Week 1"}</Text>
              <Text style={styles.journalTitle}>{weeklySongs[0]?.title ?? "Sing along"}</Text>
              <Text style={styles.journalDescription}>Tap to open the lyrics and press play.</Text>
            </View>
          </Pressable>
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
                  <ActivityIndicator color="#F0C988" />
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
                  <ActivityIndicator color="#F0C988" />
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
                  placeholderTextColor="#8A7E6C"
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
                            placeholderTextColor="#8A7E6C"
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
                  <ActivityIndicator color="#F0C988" />
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
            </ScrollView>
          </View>
          <View style={[styles.bookPage, { width: SCREEN_WIDTH }]}>
            <ScrollView contentContainerStyle={styles.bookPageContent}>
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
                  <ActivityIndicator color="#F0C988" />
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
              description="Next lesson at a glance."
            >
              <View style={styles.journalCard}>
                <View style={styles.journalCardFold} />
                <Text style={styles.journalEyebrow}>Today's page</Text>
                <Text style={styles.journalTitle}>
                  {dashboardLessonSuggestion?.title ?? "No lesson suggestion yet"}
                </Text>
                <Text style={styles.journalDescription}>
                  {dashboardLessonSuggestion
                    ? `${dashboardLessonSuggestion.cefr_level} · ${dashboardLessonSuggestion.estimated_minutes} minute lesson`
                    : "Add lessons in Supabase to see a suggestion here."}
                </Text>
              </View>
              <PrimaryButton
                label={
                  dashboardLessonSuggestion
                    ? "Open next lesson"
                    : "No lessons loaded"
                }
                onPress={() => dashboardLessonSuggestion && handleOpenLesson(dashboardLessonSuggestion)}
                disabled={!dashboardLessonSuggestion}
              />
            </SectionCard>
            </ScrollView>
          </View>
          <View style={[styles.bookPage, { width: SCREEN_WIDTH }]}>
            <ScrollView contentContainerStyle={styles.bookPageContent}>
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
                  <ActivityIndicator color="#F0C988" />
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
                  <ActivityIndicator color="#F0C988" />
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
            </ScrollView>
          </View>
          <View style={[styles.bookPage, { width: SCREEN_WIDTH }]}>
            <ScrollView contentContainerStyle={styles.bookPageContent}>
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
                  placeholderTextColor="#8A7E6C"
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
              <Pressable
                onPress={resetJournalFilters}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>Reset filters</Text>
              </Pressable>
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
                            placeholderTextColor="#8A7E6C"
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
            </ScrollView>
          </View>
          <View style={[styles.bookPage, { width: SCREEN_WIDTH }]}>
            <ScrollView contentContainerStyle={styles.bookPageContent}>
            <SectionCard
              title="Profile at a glance"
              eyebrow="Identity"
              description="A quick snapshot of the account, level, and pace you are learning with."
            >
              <View style={styles.profileHeader}>
                <View style={styles.profileAvatar}>
                  <Text style={styles.profileAvatarText}>
                    {getProfileInitials(
                      profile?.display_name ?? displayName,
                      profile?.email ?? null
                    )}
                  </Text>
                </View>
                <View style={styles.profileHeaderContent}>
                  <Text style={styles.profileHeaderName}>
                    {profile?.display_name ?? greeting}
                  </Text>
                  <Text style={styles.profileHeaderMeta}>
                    {profile?.email ?? syncStatusLabel}
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
              title="Grammar overview"
              eyebrow="Reference"
              description="Every grammar rule taught so far, collected in one place."
            >
              <PrimaryButton
                label="Open grammar overview"
                onPress={handleOpenGrammarOverview}
              />
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
            </ScrollView>
          </View>
      </ScrollView>

      <View style={styles.bookNavRow}>
        {dashboardPageIndex > 0 ? (
          <Pressable
            onPress={() => goToDashboardPage(dashboardPageIndex - 1)}
            style={({ pressed }) => [
              styles.bookNavButton,
              pressed && styles.bookNavButtonPressed,
            ]}
          >
            <Text style={styles.bookNavButtonText}>‹ Back</Text>
          </Pressable>
        ) : (
          <View style={styles.bookNavButton} />
        )}
        {dashboardPageIndex < DASHBOARD_TAB_ORDER.length - 1 ? (
          <Pressable
            onPress={() => goToDashboardPage(dashboardPageIndex + 1)}
            style={({ pressed }) => [
              styles.bookNavButton,
              styles.bookNavButtonPrimary,
              pressed && styles.bookNavButtonPressed,
            ]}
          >
            <Text style={[styles.bookNavButtonText, styles.bookNavButtonTextPrimary]}>
              Next ›
            </Text>
          </Pressable>
        ) : (
          <View style={styles.bookNavButton} />
        )}
      </View>

      <TabBar activeTab={currentNavTab} onHome={handleGoHome} onLessons={handleGoLessons} onReview={handleGoReview} onJournal={handleGoJournal} onProgress={handleGoProgress} />
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
      {loading ? <ActivityIndicator color="#F0C988" /> : null}
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
        placeholderTextColor="#897D6B"
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
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDescription}>{description}</Text>
      {children ? <View style={styles.cardBody}>{children}</View> : null}
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

function Skyline() {
  const buildings = [
    { h: 36, w: 26 },
    { h: 58, w: 20 },
    { h: 34, w: 28 },
    { h: 74, w: 18 },
    { h: 48, w: 24 },
    { h: 64, w: 20 },
    { h: 38, w: 30 },
    { h: 54, w: 22 },
    { h: 70, w: 18 },
    { h: 44, w: 26 },
  ];
  return (
    <View style={styles.skylineRow}>
      {buildings.map((building, index) => (
        <View
          key={index}
          style={[
            styles.skylineBuilding,
            { height: building.h, width: building.w },
          ]}
        >
          <View style={styles.skylineWindow} />
          {building.h > 50 ? <View style={styles.skylineWindow} /> : null}
        </View>
      ))}
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
    backgroundColor: "#11141C",
  },
  container: {
    padding: 20,
    paddingBottom: 34,
    gap: 12,
    backgroundColor: "#11141C",
  },
  centeredNotice: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#11141C",
  },
  centeredNoticeTitle: {
    color: "#F7F2E7",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  centeredNoticeDescription: {
    color: "#BCB29C",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  infoBanner: {
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  infoBannerText: {
    color: "#F4E6C4",
    fontSize: 14,
    lineHeight: 20,
  },
  hero: {
    backgroundColor: "transparent",
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(232,181,99,0.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  badgeText: {
    color: "#F0C988",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  connectionPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(42,157,143,0.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
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
    backgroundColor: "rgba(232,181,99,0.18)",
    borderWidth: 1,
    borderColor: "rgba(232,181,99,0.28)",
  },
  profileAvatarText: {
    color: "#FAF1DD",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  profileHeaderContent: {
    flex: 1,
    gap: 5,
  },
  profileHeaderName: {
    color: "#F8F3E9",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.2,
    fontFamily: SERIF_FONT,
  },
  profileHeaderMeta: {
    color: "#C0B8A4",
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
    color: "#F7F2E7",
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "800",
    marginBottom: 8,
    fontFamily: SERIF_FONT,
  },
  subtitle: {
    color: "#C2BAA6",
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "transparent",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  statLabel: {
    color: "#AB9E86",
    fontSize: 11,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "transparent",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  eyebrow: {
    color: "#9C8E78",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    fontSize: 11,
    marginBottom: 8,
    fontWeight: "700",
  },
  cardTitle: {
    color: "#F8F3E9",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
    fontFamily: SERIF_FONT,
  },
  cardDescription: {
    color: "#AFA38C",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardBody: {
    gap: 10,
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
    backgroundColor: "#1B2438",
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
    backgroundColor: "#E8B563",
  },
  weekBarIdle: {
    backgroundColor: "#243248",
  },
  weekChartLabel: {
    color: "#F8EDD6",
    fontSize: 12,
    fontWeight: "700",
  },
  weekChartMeta: {
    color: "#AFA38C",
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
    backgroundColor: "#1B2438",
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
    color: "#AFA38C",
    fontSize: 12,
    fontWeight: "800",
  },
  streakDotTextActive: {
    color: "#FFFFFF",
  },
  sessionRow: {
    backgroundColor: "transparent",
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
    color: "#F7F2E7",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  sessionRowMeta: {
    color: "#C2A77E",
    fontSize: 12,
    fontWeight: "700",
  },
  sessionRowNote: {
    color: "#F2E2BE",
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
    backgroundColor: "transparent",
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
    color: "#F7F2E7",
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  reflectionMeta: {
    color: "#A69884",
    fontSize: 12,
    fontWeight: "700",
  },
  reflectionBody: {
    color: "#F6E6C2",
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
    backgroundColor: "rgba(232,181,99,0.18)",
    borderWidth: 1,
    borderColor: "rgba(232,181,99,0.30)",
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
    color: "#F7F2E7",
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
    color: "#F0C988",
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
    color: "#F8EDD6",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#1B2438",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    color: "#F8F3E9",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    backgroundColor: "#1B2438",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    color: "#F8F3E9",
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
    backgroundColor: "#1B2438",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  choiceChipSelected: {
    backgroundColor: "rgba(232,181,99,0.20)",
    borderColor: "rgba(232,181,99,0.65)",
  },
  choiceChipText: {
    color: "#D6CFBE",
    fontSize: 13,
    fontWeight: "700",
  },
  choiceChipTextSelected: {
    color: "#F7F2E7",
  },
  message: {
    color: "#F4E6C4",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: "#E8B563",
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
    color: "#F0C988",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  socialButton: {
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  socialButtonGoogle: {
    backgroundColor: "#F7F2E7",
  },
  socialButtonApple: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(247,242,231,0.18)",
  },
  socialButtonPressed: {
    opacity: 0.85,
  },
  socialButtonTextGoogle: {
    color: "#2A2620",
    fontSize: 15,
    fontWeight: "700",
  },
  socialButtonTextApple: {
    color: "#F7F2E7",
    fontSize: 15,
    fontWeight: "700",
  },
  skylineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 5,
    height: 84,
    marginBottom: 8,
    opacity: 0.9,
  },
  skylineBuilding: {
    backgroundColor: "#0A1422",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    alignItems: "center",
    paddingTop: 9,
    gap: 6,
  },
  skylineWindow: {
    width: 5,
    height: 5,
    borderRadius: 2,
    backgroundColor: "#E8B563",
    opacity: 0.85,
  },
  tocList: {
    gap: 2,
  },
  tocRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(247,242,231,0.08)",
  },
  tocRowPressed: {
    opacity: 0.6,
  },
  tocTitle: {
    color: "#F7F2E7",
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  tocDots: {
    flex: 1,
    height: 1,
    borderBottomWidth: 1,
    borderStyle: "dotted",
    borderBottomColor: "#4A5468",
    marginBottom: 3,
  },
  tocPage: {
    color: "#8893A6",
    fontSize: 11,
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  dividerText: {
    color: "#8A7E6C",
    fontSize: 12,
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
    backgroundColor: "#243248",
  },
  stepIndexText: {
    color: "#F7EDD4",
    fontWeight: "700",
  },
  stepText: {
    color: "#F0DEB8",
    fontSize: 15,
    flex: 1,
  },
  lessonCard: {
    backgroundColor: "transparent",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 14,
    gap: 10,
  },
  lessonCardPressed: {
    transform: [{ scale: 0.99 }],
    borderColor: "rgba(232,181,99,0.45)",
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
    backgroundColor: "#1B2438",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  lessonStatusBadgeNew: {
    backgroundColor: "rgba(156,142,120,0.14)",
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
    backgroundColor: "rgba(156,142,120,0.10)",
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
    color: "#D6CFBE",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  lessonStatusTextDone: {
    color: "#FFFFFF",
  },
  lessonMeta: {
    color: "#C2A77E",
    fontSize: 12,
    fontWeight: "700",
  },
  lessonTitle: {
    color: "#F7F2E7",
    fontSize: 17,
    fontWeight: "800",
  },
  lessonDescription: {
    color: "#D3BD92",
    fontSize: 14,
    lineHeight: 20,
  },
  lessonProgressMeta: {
    color: "#A69884",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  lessonStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lessonPrompt: {
    color: "#F7F2E7",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
  },
  reviewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  reviewAnswerBox: {
    backgroundColor: "transparent",
    borderRadius: 16,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  reviewAnswerLabel: {
    color: "#9C8E78",
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  reviewAnswerText: {
    color: "#F7F2E7",
    fontSize: 17,
    fontWeight: "800",
  },
  summaryBox: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 12,
    gap: 6,
  },
  summaryBoxTitle: {
    color: "#F7F2E7",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  summaryBoxText: {
    color: "#D3BD92",
    fontSize: 14,
    lineHeight: 20,
  },
  focusCard: {
    backgroundColor: "rgba(232,181,99,0.10)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(232,181,99,0.18)",
    padding: 14,
    gap: 8,
  },
  focusTitle: {
    color: "#F7F2E7",
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  focusDescription: {
    color: "#D6CFBE",
    fontSize: 14,
    lineHeight: 20,
  },
  bookHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  bookHeaderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bookHeaderBrand: {
    color: "#F7F2E7",
    fontSize: 19,
    fontWeight: "800",
    fontFamily: SERIF_FONT,
    flexShrink: 1,
    marginRight: 12,
  },
  bookDotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  bookDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  bookDotActive: {
    backgroundColor: "#F0C988",
    width: 18,
  },
  bookPageLabel: {
    color: "#9C8E78",
    fontSize: 12,
    fontWeight: "600",
  },
  bookPager: {
    flex: 1,
  },
  bookPage: {
    flex: 1,
    padding: 12,
  },
  bookPageContent: {
    flexGrow: 1,
    padding: 18,
    gap: 14,
    backgroundColor: "rgba(247,242,231,0.025)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(247,242,231,0.08)",
  },
  bookNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  bookNavButton: {
    minWidth: 96,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bookNavButtonPrimary: {
    backgroundColor: "#E8B563",
  },
  bookNavButtonPressed: {
    opacity: 0.8,
  },
  bookNavButtonText: {
    color: "#D4DDF2",
    fontWeight: "700",
    fontSize: 14,
  },
  bookNavButtonTextPrimary: {
    color: "#FFFFFF",
  },
  journalCard: {
    backgroundColor: "#F7F2E7",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    gap: 4,
    position: "relative",
    overflow: "hidden",
  },
  journalCardFold: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 22,
    borderBottomWidth: 22,
    borderRightColor: "#DCD3BC",
    borderBottomColor: "transparent",
    borderTopColor: "transparent",
    borderLeftColor: "transparent",
  },
  journalEyebrow: {
    color: "#9A6B2E",
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 10,
    fontWeight: "800",
  },
  journalTitle: {
    color: "#2A2620",
    fontSize: 18,
    fontWeight: "700",
    fontFamily: SERIF_FONT,
    marginTop: 2,
  },
  journalDescription: {
    color: "#6B6457",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  quizColumn: {
    gap: 10,
  },
  learnNoteCard: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  learnNoteHeading: {
    color: "#F7F2E7",
    fontSize: 14,
    fontWeight: "800",
  },
  learnNoteBody: {
    color: "#D6CFBE",
    fontSize: 14,
    lineHeight: 20,
  },
  lessonHint: {
    color: "#BCB29C",
    fontSize: 13,
    lineHeight: 19,
  },
  lessonTapLabel: {
    color: "#A69884",
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
    backgroundColor: "transparent",
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
    color: "#F7F2E7",
    fontSize: 15,
    fontWeight: "800",
  },
  achievementTitleUnlocked: {
    color: "#EFFFFA",
  },
  achievementDescription: {
    color: "#AFA38C",
    fontSize: 13,
    lineHeight: 18,
  },
  achievementPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#243248",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  achievementPillUnlocked: {
    backgroundColor: "rgba(42,157,143,0.22)",
    borderColor: "rgba(42,157,143,0.45)",
  },
  achievementPillText: {
    color: "#D6CFBE",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  achievementPillTextUnlocked: {
    color: "#FFFFFF",
  },
  spotlightCard: {
    backgroundColor: "rgba(232,181,99,0.14)",
    borderWidth: 1,
    borderColor: "rgba(232,181,99,0.22)",
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
    color: "#F7F2E7",
    fontSize: 18,
    fontWeight: "800",
  },
  spotlightDescription: {
    color: "#F6E6C2",
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
    backgroundColor: "#1B2438",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: "rgba(232,181,99,0.18)",
    borderColor: "rgba(232,181,99,0.72)",
  },
  filterChipText: {
    color: "#EFDCB5",
    fontSize: 13,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: "#F7F2E7",
  },
  filterChipCount: {
    color: "#A69884",
    fontSize: 12,
    fontWeight: "800",
  },
  filterChipCountActive: {
    color: "#F6E6C2",
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
    color: "#F8EDD6",
    fontSize: 14,
    fontWeight: "600",
  },
  skillValue: {
    color: "#BCB29C",
    fontSize: 14,
    fontWeight: "700",
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#1F2B3E",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    backgroundColor: "#1E2A3E",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillText: {
    color: "#EFDCB5",
    fontSize: 13,
    fontWeight: "600",
  },
  tabBar: {
    flexDirection: "row",
    gap: 10,
    padding: 10,
    marginTop: 4,
    backgroundColor: "#131A28",
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
    backgroundColor: "#1B2438",
  },
  tabButtonActive: {
    backgroundColor: "#E8B563",
  },
  tabButtonText: {
    color: "#D6CFBE",
    fontSize: 13,
    fontWeight: "800",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },
});
