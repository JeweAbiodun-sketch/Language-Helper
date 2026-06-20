import React from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { isSupabaseConfigured } from "./src/lib/supabase";

type SkillKey = "Reading" | "Writing" | "Listening" | "Speaking";

type Skill = {
  key: SkillKey;
  value: number;
  tone: string;
};

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

export default function App() {
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
            Bite-sized lessons, spaced repetition, and visible progress in one
            focused daily loop.
          </Text>
          <View style={styles.connectionPill}>
            <Text style={styles.connectionPillText}>
              {isSupabaseConfigured
                ? "Supabase ready"
                : "Add Supabase env vars to connect"}
            </Text>
          </View>
          <View style={styles.heroRow}>
            <StatCard label="Streak" value="7 days" />
            <StatCard label="XP today" value="120" />
            <StatCard label="Lesson" value="10 min" />
          </View>
        </View>

        <SectionCard
          title="Today's lesson"
          eyebrow="Adaptive plan"
          description="A compact session built from your weak spots and current CEFR level."
        >
          {lessonSteps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepIndex}>
                <Text style={styles.stepIndexText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
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
          title="MVP focus"
          eyebrow="Build order"
          description="This starter lays the groundwork for onboarding, lesson flow, SRS, and progress."
        >
          <View style={styles.pillRow}>
            <Pill label="Onboarding" />
            <Pill label="Placement test" />
            <Pill label="SRS queue" />
            <Pill label="Offline-ready data" />
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
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
});
