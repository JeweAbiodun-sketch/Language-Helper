export const lessonSteps = [
  "Warm-up vocab set: food and cafes",
  "Grammar focus: accusative articles",
  "Listening check: a short order at a bakery",
  "Speaking prompt: introduce yourself politely",
] as const;

export const placementQuestions = [
  {
    prompt: "Which article fits Brot?",
    options: ["der", "die", "das"],
    correctIndex: 2,
    focus: "grammar",
  },
  {
    prompt: "Which phrase is the most polite way to start a cafe order?",
    options: ["Ich will Kaffee", "Guten Tag, ich haette gern Kaffee", "Kaffee jetzt"],
    correctIndex: 1,
    focus: "speaking",
  },
  {
    prompt: "What is the best reply to 'Wie geht's?'",
    options: ["Ich heisse Anna", "Gut, danke", "Noch einmal, bitte"],
    correctIndex: 1,
    focus: "speaking",
  },
  {
    prompt: "Which word means milk?",
    options: ["Milch", "Brot", "Kaffee"],
    correctIndex: 0,
    focus: "vocabulary",
  },
] as const;

export const lessonQuizTemplates = {
  accusative: {
    prompt: "Which article fits 'I buy the bread'?",
    options: ["den Brot", "die Brot", "das Brot"],
    correctIndex: 0,
    hint: "Brot is neuter, but the accusative article matters here.",
  },
  greeting: {
    prompt: "Which phrase is the most polite way to start a cafe order?",
    options: ["Ich will Kaffee", "Guten Tag, ich haette gern Kaffee", "Kaffee jetzt"],
    correctIndex: 1,
    hint: "Polite requests usually sound softer and more formal.",
  },
  default: {
    prompt: "Which response best matches a short German practice dialogue?",
    options: ["Ja, gerne", "Nein, niemals", "Vielleicht spaeter"],
    correctIndex: 0,
    hint: "For a friendly practice exchange, a simple affirmative answer fits best.",
  },
} as const;
