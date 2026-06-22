// Weekly sing-along songs.
//
// Each song is a short, original piece written to reinforce the vocabulary
// from a batch of lessons - one song covers roughly a week's worth of
// material rather than a single lesson. The audio itself lives in
// /assets/audio and is wired up separately in src/components/SingAlong.tsx
// (require() needs a static, literal path, so the audio file reference
// can't live in this data file).
//
// `startSeconds` on each lyric line is an ESTIMATE, evenly spaced across
// the song's vocal window - Suno (and most AI music tools) doesn't hand
// back word-level timestamps, so this is a reasonable approximation for
// "which line are we probably on" rather than a frame-accurate sync. If a
// line ever feels out of step while testing, nudge its startSeconds and
// the ones after it.

export type SongVocabCard = {
  prompt: string;
  answer: string;
};

export type LyricLine = {
  text: string;
  startSeconds: number;
};

export type LyricSection = {
  label: string;
  lines: LyricLine[];
};

export type FillBlankExercise = {
  id: string;
  lineWithBlank: string;
  correctAnswer: string;
  options: string[];
};

export type CulturalNote = {
  title: string;
  body: string;
};

export type WeeklySong = {
  id: string;
  weekLabel: string;
  level: string;
  title: string;
  coversLessons: string[];
  description: string;
  lyrics: LyricSection[];
  vocabCards: SongVocabCard[];
  fillBlankExercises: FillBlankExercise[];
  culturalNote: CulturalNote;
};

export const weeklySongs: WeeklySong[] = [
  {
    id: "week-01-guten-tag",
    weekLabel: "Week 1",
    level: "A1",
    title: "Guten Tag",
    coversLessons: ["greetings-cafe", "accusative-basics"],
    description:
      "Covers this week's greetings and cafe vocabulary - sing it a couple of times and the words start to stick on their own.",
    lyrics: [
      {
        label: "Verse 1",
        lines: [
          { text: "Guten Tag, guten Tag, walking through the door", startSeconds: 4 },
          { text: "Guten Tag, guten Tag, that's the safest word before", startSeconds: 10 },
          { text: "Hallo's for your friends, but Guten Tag's the way", startSeconds: 15 },
          { text: "When you don't know who you're talking to today", startSeconds: 21 },
        ],
      },
      {
        label: "Chorus",
        lines: [
          { text: "Ich hätte gern, ich hätte gern einen Kaffee", startSeconds: 27 },
          { text: "Not \"ich will\" - that's much too strong, you see", startSeconds: 33 },
          { text: "Der Kaffee, die Milch, der Zucker too", startSeconds: 38 },
          { text: "Polite words get you everything you want to do", startSeconds: 44 },
        ],
      },
      {
        label: "Verse 2",
        lines: [
          { text: "Der Kaffee is the coffee, hold that \"der\" in mind", startSeconds: 50 },
          { text: "Die Milch is feminine, a different kind", startSeconds: 55 },
          { text: "Der Zucker sweetens up your cup just right", startSeconds: 61 },
          { text: "Three little words to get you through the night", startSeconds: 67 },
        ],
      },
      {
        label: "Outro",
        lines: [
          { text: "Tschüss, tschüss, when you're heading out the door", startSeconds: 73 },
          { text: "Auf Wiedersehen, if you're feeling more formal than before", startSeconds: 78 },
        ],
      },
    ],
    vocabCards: [
      { prompt: "Guten Tag", answer: "Good day / hello (formal, any time of day)" },
      { prompt: "Ich hätte gern...", answer: "I would like... (polite request)" },
      { prompt: "der Kaffee", answer: "the coffee" },
      { prompt: "die Milch", answer: "the milk" },
      { prompt: "der Zucker", answer: "the sugar" },
      { prompt: "Tschüss", answer: "Bye (casual)" },
      { prompt: "Auf Wiedersehen", answer: "Goodbye (formal)" },
    ],
    fillBlankExercises: [
      {
        id: "week-01-blank-1",
        lineWithBlank: "____, ____, walking through the door",
        correctAnswer: "Guten Tag",
        options: ["Guten Tag", "Tschüss", "Auf Wiedersehen"],
      },
      {
        id: "week-01-blank-2",
        lineWithBlank: "____ einen Kaffee",
        correctAnswer: "Ich hätte gern",
        options: ["Ich hätte gern", "Ich will", "Ich habe"],
      },
      {
        id: "week-01-blank-3",
        lineWithBlank: "____, die Milch, der Zucker too",
        correctAnswer: "Der Kaffee",
        options: ["Der Kaffee", "Die Kaffee", "Das Kaffee"],
      },
      {
        id: "week-01-blank-4",
        lineWithBlank: "Der Kaffee, ____, der Zucker too",
        correctAnswer: "die Milch",
        options: ["die Milch", "der Milch", "das Milch"],
      },
      {
        id: "week-01-blank-5",
        lineWithBlank: "Der Kaffee, die Milch, ____ too",
        correctAnswer: "der Zucker",
        options: ["der Zucker", "die Zucker", "das Zucker"],
      },
      {
        id: "week-01-blank-6",
        lineWithBlank: "____, ____, when you're heading out the door",
        correctAnswer: "Tschüss",
        options: ["Tschüss", "Guten Tag", "Auf Wiedersehen"],
      },
      {
        id: "week-01-blank-7",
        lineWithBlank: "____, if you're feeling more formal than before",
        correctAnswer: "Auf Wiedersehen",
        options: ["Auf Wiedersehen", "Tschüss", "Hallo"],
      },
    ],
    culturalNote: {
      title: "Why Germans take greetings seriously",
      body: "Getting the greeting right matters more in German than in English, because it signals how formal you're being - and that choice sticks for the rest of the conversation. \"Guten Tag\" plus the formal \"Sie\" is the safe default with strangers, officials, and anyone older than you; switching to \"du\" and casual greetings usually happens only after the other person invites it. Regionally, you'll also hear \"Moin\" as an all-purpose greeting across northern Germany, and \"Grüß Gott\" in Bavaria and Austria - both work like a casual \"Guten Tag,\" just with local flavor.",
    },
  },
];

export function getWeeklySong(id: string | null | undefined): WeeklySong | null {
  if (!id) return weeklySongs[0] ?? null;
  return weeklySongs.find((song) => song.id === id) ?? weeklySongs[0] ?? null;
}
