// Static curriculum content for the app.
//
// Each lesson row in Supabase (`public.lessons`) carries a `content_key`.
// That key looks up the actual teaching content here: a short video to
// watch first (the "Learn" phase), a few plain-language notes, and then a
// small multi-question quiz (the "Practice" phase).
//
// IMPORTANT: `videoId` is the YouTube video ID (the part after `v=` in a
// youtube.com/watch?v=... URL, or the last path segment of a youtu.be/...
// link) for the matching lesson in the "A1.1 - All you need" playlist by
// Benjamin - Der Deutschlehrer. These are left blank on purpose: paste in
// the real video ID once you've picked the matching video from the
// playlist, and the lesson will start embedding it automatically. Until
// then the Learn screen shows a friendly "video coming soon" placeholder
// instead of crashing or guessing a wrong video.
//
// `learnNotes` are original explanations written for this app - they are
// NOT transcribed from the video. Think of the video as the "teacher"
// and these notes as the short recap a student would jot down afterwards.

export type LearnNote = {
  heading: string;
  body: string;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: readonly string[];
  correctIndex: number;
  hint: string;
};

export type LessonContent = {
  contentKey: string;
  videoId: string;
  videoTitle: string;
  learnIntro: string;
  learnNotes: LearnNote[];
  quiz: QuizQuestion[];
};

export const lessonContentByKey: Record<string, LessonContent> = {
  "greetings-cafe": {
    contentKey: "greetings-cafe",
    videoId: "",
    videoTitle: "Greetings and polite requests (A1.1)",
    learnIntro:
      "Before you order anything, you need two things: a greeting that fits the situation, and a polite way to ask for what you want. Watch the video, then check the notes below.",
    learnNotes: [
      {
        heading: "Greetings change with the situation",
        body: "\"Hallo\" is casual, fine for friends or people your own age. With staff, strangers, or anyone older, \"Guten Tag\" is the safe default at any time of day. \"Guten Morgen\" and \"Guten Abend\" are time-specific versions of the same idea.",
      },
      {
        heading: "\"Ich hätte gern...\" is your politeness shortcut",
        body: "\"Ich will Kaffee\" (I want coffee) sounds blunt and demanding in German, even though it's a direct translation of normal English. \"Ich hätte gern einen Kaffee\" (I would like a coffee) is the standard polite way to order almost anything.",
      },
      {
        heading: "Cafe basics",
        body: "der Kaffee (coffee), der Tee (tea), das Wasser (water), die Milch (milk), der Zucker (sugar). Notice each word has its own article (der/die/das) - there's no shortcut, you just learn them with the word.",
      },
    ],
    quiz: [
      {
        id: "greetings-cafe-q1",
        prompt: "You walk into a café you've never visited. What's the safest greeting?",
        options: ["Na?", "Guten Tag", "Tschüss"],
        correctIndex: 1,
        hint: "\"Guten Tag\" works at any time of day with people you don't know.",
      },
      {
        id: "greetings-cafe-q2",
        prompt: "Which phrase politely asks for a coffee?",
        options: ["Kaffee!", "Ich hätte gern einen Kaffee.", "Gib mir Kaffee."],
        correctIndex: 1,
        hint: "\"Ich hätte gern...\" is the gentle way to ask for something.",
      },
      {
        id: "greetings-cafe-q3",
        prompt: "Which word means \"milk\"?",
        options: ["die Milch", "der Zucker", "das Wasser"],
        correctIndex: 0,
        hint: "It sounds close to its English cousin.",
      },
    ],
  },

  "accusative-basics": {
    contentKey: "accusative-basics",
    videoId: "",
    videoTitle: "The accusative case, explained simply (A1.1)",
    learnIntro:
      "The accusative case sounds scary, but for a beginner it boils down to one small, learnable rule. Watch the video for the full explanation, then lock in the shortcut below.",
    learnNotes: [
      {
        heading: "What \"accusative\" actually means",
        body: "It just marks the direct object of a sentence - the thing the action is being done to. In \"I buy the bread,\" bread is the direct object, so it takes the accusative article in German.",
      },
      {
        heading: "The one rule worth memorizing",
        body: "Only the masculine article changes: der becomes den. Feminine (die), neuter (das), and plural (die) stay exactly the same in the accusative. That means most of the time you don't need to change anything at all.",
      },
      {
        heading: "Examples",
        body: "Ich kaufe das Brot (neuter - no change). Ich trinke die Milch (feminine - no change). Ich sehe den Mann (masculine: der → den - this is the one to watch for).",
      },
    ],
    quiz: [
      {
        id: "accusative-basics-q1",
        prompt: "Ich kaufe ___ Brot.",
        options: ["den", "die", "das"],
        correctIndex: 2,
        hint: "Brot is neuter, and neuter never changes in the accusative.",
      },
      {
        id: "accusative-basics-q2",
        prompt: "Which gender is the only one that changes its article in the accusative case?",
        options: ["Masculine", "Feminine", "Neuter"],
        correctIndex: 0,
        hint: "der becomes den - that's the change to remember.",
      },
      {
        id: "accusative-basics-q3",
        prompt: "Ich sehe ___ Mann.",
        options: ["der", "den", "das"],
        correctIndex: 1,
        hint: "Mann is masculine, so der becomes den here.",
      },
    ],
  },

  "shopping-dialogue": {
    contentKey: "shopping-dialogue",
    videoId: "",
    videoTitle: "Listening: a short shopping exchange (A1.1)",
    learnIntro:
      "Real conversations move fast, and that's normal even for confident learners. The trick is knowing what to listen for. Watch the video once for the gist, then again using the tips below.",
    learnNotes: [
      {
        heading: "Don't chase every word",
        body: "On a first listen, just try to catch numbers, prices, and product names. Those carry most of the meaning in a shopping conversation, even if you miss the small connecting words.",
      },
      {
        heading: "Phrases you'll hear constantly",
        body: "\"Was kostet das?\" (What does that cost?), \"Haben Sie...?\" (Do you have...?), and \"Das wäre dann alles\" (That would be everything) cover most of a simple shop interaction.",
      },
      {
        heading: "Numbers are your anchor",
        body: "Prices are usually the easiest thing to catch because numbers don't change with grammar the way other words do. If you can hear the number, you already know roughly what's happening.",
      },
    ],
    quiz: [
      {
        id: "shopping-dialogue-q1",
        prompt: "Which question asks for the price of something?",
        options: ["Wie heißt das?", "Was kostet das?", "Wo ist das?"],
        correctIndex: 1,
        hint: "\"Kosten\" is the verb for \"to cost.\"",
      },
      {
        id: "shopping-dialogue-q2",
        prompt: "Which phrase means \"Do you have...?\"",
        options: ["Haben Sie...?", "Sind Sie...?", "Gehen Sie...?"],
        correctIndex: 0,
        hint: "\"Haben\" is \"to have.\"",
      },
      {
        id: "shopping-dialogue-q3",
        prompt: "If someone says \"Das macht zehn Euro,\" how much do you owe?",
        options: ["10 euros", "100 euros", "1000 euros"],
        correctIndex: 0,
        hint: "\"Zehn\" is one of the first numbers most courses teach - it means ten.",
      },
    ],
  },

  "daily-routines": {
    contentKey: "daily-routines",
    videoId: "",
    videoTitle: "Talking about your day (A1.1)",
    learnIntro:
      "This lesson is about describing a normal day - what you do, and roughly when. Watch the video, then use the notes to anchor the grammar pattern.",
    learnNotes: [
      {
        heading: "Saying when something happens",
        body: "\"um\" + a clock time tells you exactly when: \"um acht Uhr\" (at eight o'clock). \"am Morgen / Nachmittag / Abend\" describes a broader part of the day (in the morning / afternoon / evening).",
      },
      {
        heading: "Regular verb endings in the present tense",
        body: "Most verbs follow a predictable pattern: ich -e, du -st, er/sie/es -t, wir -en, ihr -t, sie/Sie -en. For example, frühstücken (to have breakfast): ich frühstücke, du frühstückst, er frühstückt.",
      },
      {
        heading: "Sequencing your day",
        body: "\"zuerst\" (first), \"dann\" (then), and \"danach\" (after that) let you string actions together without needing more complex grammar.",
      },
    ],
    quiz: [
      {
        id: "daily-routines-q1",
        prompt: "Ich ___ um acht Uhr. (frühstücken - to have breakfast)",
        options: ["frühstücke", "frühstückst", "frühstücken"],
        correctIndex: 0,
        hint: "\"ich\" takes the -e ending.",
      },
      {
        id: "daily-routines-q2",
        prompt: "Which word means \"first\" in a sequence of actions?",
        options: ["zuerst", "danach", "vielleicht"],
        correctIndex: 0,
        hint: "It's the word you'd use to open a list of steps.",
      },
      {
        id: "daily-routines-q3",
        prompt: "\"um acht Uhr\" means:",
        options: ["around eight people", "at eight o'clock", "eight things"],
        correctIndex: 1,
        hint: "\"Uhr\" relates to clock time here, not objects or people.",
      },
    ],
  },

  "family-introductions": {
    contentKey: "family-introductions",
    videoId: "",
    videoTitle: "Family vocabulary and introductions (A1.1)",
    learnIntro:
      "Introducing yourself and your family is one of the most useful early conversations you'll have. Watch the video, then study the small but important word changes below.",
    learnNotes: [
      {
        heading: "Core family words",
        body: "die Mutter (mother), der Vater (father), die Schwester (sister), der Bruder (brother), die Eltern (parents).",
      },
      {
        heading: "\"mein\" changes with the noun's gender",
        body: "It's \"mein Bruder\" (masculine) but \"meine Schwester\" (feminine). This is the same pattern as der/die/das - the possessive word has to match the gender of the noun that follows it.",
      },
      {
        heading: "Asking someone's name politely",
        body: "\"Wie heißt du?\" is informal, used with people your own age or younger. \"Wie heißen Sie?\" is the formal version, used with strangers, older people, or in professional settings.",
      },
    ],
    quiz: [
      {
        id: "family-introductions-q1",
        prompt: "Which is correct for \"This is my sister\"?",
        options: ["Das ist mein Schwester.", "Das ist meine Schwester.", "Das ist meins Schwester."],
        correctIndex: 1,
        hint: "Schwester is feminine, so it needs \"meine,\" not \"mein.\"",
      },
      {
        id: "family-introductions-q2",
        prompt: "Which phrase politely asks a stranger's name?",
        options: ["Wie heißt du?", "Wie heißen Sie?", "Wer bist du?"],
        correctIndex: 1,
        hint: "The formal \"Sie\" form is safer with people you don't know.",
      },
      {
        id: "family-introductions-q3",
        prompt: "Which word means \"parents\"?",
        options: ["die Eltern", "die Kinder", "die Geschwister"],
        correctIndex: 0,
        hint: "\"Geschwister\" actually means siblings, not parents.",
      },
    ],
  },

  "restaurant-orders": {
    contentKey: "restaurant-orders",
    videoId: "",
    videoTitle: "Ordering at a restaurant (A1.1/A2)",
    learnIntro:
      "Restaurant German is mostly a handful of fixed phrases. Watch the video to hear them in context, then practice recognizing them below.",
    learnNotes: [
      {
        heading: "Ordering politely",
        body: "\"Ich nehme...\" (I'll take/have...) is the standard, friendly way to order food - softer than \"ich will,\" the same way it was for drinks earlier.",
      },
      {
        heading: "Asking for the bill",
        body: "\"Die Rechnung, bitte\" is all you need at the end of a meal. \"Die Speisekarte\" is the menu, in case you need to ask for one.",
      },
      {
        heading: "A useful adjective",
        body: "\"lecker\" (tasty) is a simple, natural way to react to food without needing a full sentence.",
      },
    ],
    quiz: [
      {
        id: "restaurant-orders-q1",
        prompt: "Which phrase politely orders food?",
        options: ["Ich nehme die Suppe.", "Ich will Suppe.", "Suppe!"],
        correctIndex: 0,
        hint: "\"Ich nehme...\" is the standard ordering phrase.",
      },
      {
        id: "restaurant-orders-q2",
        prompt: "How do you ask for the bill?",
        options: ["Die Rechnung, bitte.", "Die Karte, bitte.", "Der Tisch, bitte."],
        correctIndex: 0,
        hint: "\"Rechnung\" is the word for bill/invoice.",
      },
      {
        id: "restaurant-orders-q3",
        prompt: "What does \"die Speisekarte\" mean?",
        options: ["the menu", "the receipt", "the waiter"],
        correctIndex: 0,
        hint: "\"Speise\" relates to food, \"Karte\" to a card or list.",
      },
    ],
  },

  "word-order-basics": {
    contentKey: "word-order-basics",
    videoId: "",
    videoTitle: "Why the verb always comes second (A1.1/A2)",
    learnIntro:
      "German word order trips up a lot of beginners because it doesn't map directly onto English. Watch the video for the explanation, then study the rule that makes it click.",
    learnNotes: [
      {
        heading: "The verb-second rule",
        body: "In a normal German statement, the conjugated verb is always the second element - no matter what comes first. This is true even when the first element isn't the subject.",
      },
      {
        heading: "Watch what happens when you start with something other than the subject",
        body: "\"Ich trinke Kaffee\" (I drink coffee) - verb is second, as expected. But if you start the sentence with \"heute\" (today): \"Heute trinke ich Kaffee\" - the verb stays second, and \"ich\" moves after it.",
      },
      {
        heading: "A rough ordering tendency",
        body: "Beyond the verb-second rule, German tends to put time before place: \"Ich fahre morgen nach Berlin\" (I'm traveling tomorrow to Berlin) puts \"morgen\" (tomorrow) before \"nach Berlin\" (to Berlin).",
      },
    ],
    quiz: [
      {
        id: "word-order-basics-q1",
        prompt: "Heute ___ ich Kaffee.",
        options: ["trinke", "trinken", "trinkst"],
        correctIndex: 0,
        hint: "The verb still has to agree with \"ich,\" even though it's not in its usual spot.",
      },
      {
        id: "word-order-basics-q2",
        prompt: "Which sentence correctly follows the verb-second rule?",
        options: ["Heute ich trinke Kaffee.", "Heute trinke ich Kaffee.", "Trinke heute ich Kaffee."],
        correctIndex: 1,
        hint: "The verb needs to be the second element, right after \"heute.\"",
      },
      {
        id: "word-order-basics-q3",
        prompt: "In \"Ich fahre morgen nach Berlin,\" what comes right after the subject \"Ich\"?",
        options: ["the verb", "the time word", "the place"],
        correctIndex: 0,
        hint: "Subject, then verb, then everything else - that's the core pattern.",
      },
    ],
  },
};

export const defaultLessonContent: LessonContent = {
  contentKey: "default",
  videoId: "",
  videoTitle: "Lesson video",
  learnIntro:
    "This lesson doesn't have its matching video and notes wired up yet. You can still practice with the quick check below, or come back once the content has been added.",
  learnNotes: [
    {
      heading: "Content coming soon",
      body: "Add an entry to `lessonContentByKey` in src/content/lessonContent.ts with this lesson's content_key to give it a real video and notes.",
    },
  ],
  quiz: [
    {
      id: "default-q1",
      prompt: "Which response best matches a short, friendly German exchange?",
      options: ["Ja, gerne", "Nein, niemals", "Vielleicht später"],
      correctIndex: 0,
      hint: "For a friendly practice exchange, a simple affirmative answer fits best.",
    },
  ],
};

export function getLessonContent(contentKey: string | null | undefined): LessonContent {
  if (!contentKey) return defaultLessonContent;
  return lessonContentByKey[contentKey] ?? defaultLessonContent;
}

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
