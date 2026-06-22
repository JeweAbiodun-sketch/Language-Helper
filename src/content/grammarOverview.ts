// A consolidated grammar reference - inspired by the "Grammatikübersicht"
// section found at the back of most German coursebooks. Each entry should
// map to a grammar point already taught in a lesson, just collected here
// in one place so it's quick to flip back to without re-watching a lesson.

export type GrammarRule = {
  id: string;
  title: string;
  summary: string;
  example: string;
  fromLesson: string;
};

export const grammarRules: GrammarRule[] = [
  {
    id: "accusative-case",
    title: "The accusative case",
    summary:
      "Marks the direct object of a sentence. Only the masculine article changes: der becomes den. Feminine (die), neuter (das), and plural (die) stay the same.",
    example: "Ich kaufe das Brot. / Ich sehe den Mann.",
    fromLesson: "Accusative basics",
  },
  {
    id: "verb-second",
    title: "Verb-second word order",
    summary:
      "In a normal statement, the conjugated verb is always the second element - even when the sentence doesn't start with the subject.",
    example: "Ich trinke Kaffee. / Heute trinke ich Kaffee.",
    fromLesson: "Why the verb always comes second",
  },
  {
    id: "possessive-gender-agreement",
    title: "Possessives agree with gender",
    summary:
      "mein changes to meine in front of a feminine noun, the same way der/die/das works.",
    example: "mein Bruder, but meine Schwester.",
    fromLesson: "Family vocabulary and introductions",
  },
  {
    id: "formal-requests",
    title: "Softening a request",
    summary:
      "\"Ich hätte gern...\" (I would like...) is the polite way to ask for something - \"ich will\" (I want) sounds demanding even in ordinary situations.",
    example: "Ich hätte gern einen Kaffee, not Ich will Kaffee.",
    fromLesson: "Greetings and ordering",
  },
];
