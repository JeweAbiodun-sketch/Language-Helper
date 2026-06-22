// Weekly sing-along songs.
//
// Each song is a short, original piece written to reinforce the vocabulary
// from a batch of lessons - one song covers roughly a week's worth of
// material rather than a single lesson. The audio itself lives in
// /assets/audio and is wired up separately in src/components/SingAlong.tsx
// (require() needs a static, literal path, so the audio file reference
// can't live in this data file).

export type LyricSection = {
  label: string;
  lines: string[];
};

export type WeeklySong = {
  id: string;
  weekLabel: string;
  title: string;
  coversLessons: string[];
  description: string;
  lyrics: LyricSection[];
};

export const weeklySongs: WeeklySong[] = [
  {
    id: "week-01-guten-tag",
    weekLabel: "Week 1",
    title: "Guten Tag",
    coversLessons: ["greetings-cafe", "accusative-basics"],
    description:
      "Covers this week's greetings and cafe vocabulary - sing it a couple of times and the words start to stick on their own.",
    lyrics: [
      {
        label: "Verse 1",
        lines: [
          "Guten Tag, guten Tag, walking through the door",
          "Guten Tag, guten Tag, that's the safest word before",
          "Hallo's for your friends, but Guten Tag's the way",
          "When you don't know who you're talking to today",
        ],
      },
      {
        label: "Chorus",
        lines: [
          "Ich hätte gern, ich hätte gern einen Kaffee",
          "Not \"ich will\" - that's much too strong, you see",
          "Der Kaffee, die Milch, der Zucker too",
          "Polite words get you everything you want to do",
        ],
      },
      {
        label: "Verse 2",
        lines: [
          "Der Kaffee is the coffee, hold that \"der\" in mind",
          "Die Milch is feminine, a different kind",
          "Der Zucker sweetens up your cup just right",
          "Three little words to get you through the night",
        ],
      },
      {
        label: "Outro",
        lines: [
          "Tschüss, tschüss, when you're heading out the door",
          "Auf Wiedersehen, if you're feeling more formal than before",
        ],
      },
    ],
  },
];

export function getWeeklySong(id: string | null | undefined): WeeklySong | null {
  if (!id) return weeklySongs[0] ?? null;
  return weeklySongs.find((song) => song.id === id) ?? weeklySongs[0] ?? null;
}
