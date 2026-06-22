import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Audio, AVPlaybackStatus } from "expo-av";
import { WeeklySong } from "../content/weeklySongs";

// require() needs a static, literal path per song id - this map is the one
// place that connects a song's id to its bundled audio file. Add a new line
// here whenever a new weekly song is added to weeklySongs.ts.
const SONG_AUDIO: Record<string, number> = {
  "week-01-guten-tag": require("../../assets/audio/week-01-guten-tag.mp3"),
};

function formatTime(millis: number) {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type SingAlongProps = {
  song: WeeklySong;
};

export default function SingAlong({ song }: SingAlongProps) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, [song.id]);

  function handleStatusUpdate(status: AVPlaybackStatus) {
    if (!status.isLoaded) return;
    setPositionMillis(status.positionMillis);
    setDurationMillis(status.durationMillis ?? 0);
    setIsPlaying(status.isPlaying);
  }

  async function handleTogglePlay() {
    const audioSource = SONG_AUDIO[song.id];
    if (!audioSource) {
      setLoadError("No audio file found for this song yet.");
      return;
    }

    if (!soundRef.current) {
      setIsLoading(true);
      setLoadError(null);
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(audioSource, {
          shouldPlay: true,
        });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate(handleStatusUpdate);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Could not load the song."
        );
      }
      setIsLoading(false);
      return;
    }

    if (isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  }

  const progress =
    durationMillis > 0 ? Math.min(positionMillis / durationMillis, 1) : 0;
  const positionSeconds = positionMillis / 1000;

  // Find the line whose startSeconds is the latest one at or before the
  // current playback position - that's our best estimate of "the current
  // line," given we only have approximate timing.
  const allLines = useMemo(
    () => song.lyrics.flatMap((section) => section.lines),
    [song]
  );
  const currentLineIndex = useMemo(() => {
    if (!isPlaying && positionSeconds === 0) return -1;
    let index = -1;
    for (let i = 0; i < allLines.length; i++) {
      if (allLines[i].startSeconds <= positionSeconds) {
        index = i;
      }
    }
    return index;
  }, [allLines, positionSeconds, isPlaying]);
  const currentLineText = allLines[currentLineIndex]?.text;

  return (
    <View style={styles.column}>
      <View style={styles.playerCard}>
        <Pressable
          onPress={handleTogglePlay}
          style={({ pressed }) => [
            styles.playButton,
            pressed && styles.playButtonPressed,
          ]}
        >
          <Text style={styles.playButtonText}>
            {isLoading ? "..." : isPlaying ? "❙❙" : "▶"}
          </Text>
        </Pressable>
        <View style={styles.playerInfo}>
          <View style={styles.progressTrackOuter}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.timeText}>
            {formatTime(positionMillis)} / {formatTime(durationMillis)}
          </Text>
        </View>
      </View>

      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      <View style={styles.lyricsColumn}>
        {song.lyrics.map((section) => (
          <View key={section.label} style={styles.lyricSection}>
            <Text style={styles.lyricSectionLabel}>{section.label}</Text>
            {section.lines.map((line, index) => {
              const isCurrent = line.text === currentLineText;
              return (
                <Text
                  key={index}
                  style={[styles.lyricLine, isCurrent && styles.lyricLineActive]}
                >
                  {line.text}
                </Text>
              );
            })}
          </View>
        ))}
      </View>

      {song.fillBlankExercises.length > 0 ? (
        <View style={styles.exerciseColumn}>
          <Text style={styles.exerciseHeading}>Fill in the blank</Text>
          <Text style={styles.exerciseSubheading}>
            Pick the word that completes each line from the song.
          </Text>
          {song.fillBlankExercises.map((exercise) => {
            const selected = blankAnswers[exercise.id];
            return (
              <View key={exercise.id} style={styles.exerciseCard}>
                <Text style={styles.exerciseLine}>{exercise.lineWithBlank}</Text>
                <View style={styles.exerciseOptionsRow}>
                  {exercise.options.map((option) => {
                    const isSelected = selected === option;
                    const isCorrect = option === exercise.correctAnswer;
                    const showResult = Boolean(selected);
                    return (
                      <Pressable
                        key={option}
                        onPress={() =>
                          setBlankAnswers((current) => ({
                            ...current,
                            [exercise.id]: option,
                          }))
                        }
                        style={[
                          styles.exerciseOption,
                          isSelected && isCorrect && styles.exerciseOptionCorrect,
                          isSelected && !isCorrect && styles.exerciseOptionWrong,
                          showResult &&
                            !isSelected &&
                            isCorrect &&
                            styles.exerciseOptionRevealCorrect,
                        ]}
                      >
                        <Text style={styles.exerciseOptionText}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: 16,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "rgba(247,242,231,0.12)",
    borderRadius: 16,
    padding: 14,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E8B563",
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonPressed: {
    opacity: 0.8,
  },
  playButtonText: {
    color: "#2A2620",
    fontSize: 16,
    fontWeight: "700",
  },
  playerInfo: {
    flex: 1,
    gap: 6,
  },
  progressTrackOuter: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(247,242,231,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    backgroundColor: "#E8B563",
  },
  timeText: {
    color: "#8A7E6C",
    fontSize: 11,
    fontWeight: "600",
  },
  errorText: {
    color: "#E8927E",
    fontSize: 13,
  },
  lyricsColumn: {
    gap: 18,
  },
  lyricSection: {
    gap: 4,
  },
  lyricSectionLabel: {
    color: "#9C8E78",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  lyricLine: {
    color: "#8A7E6C",
    fontSize: 16,
    lineHeight: 25,
  },
  lyricLineActive: {
    color: "#E8B563",
    fontWeight: "700",
  },
  exerciseColumn: {
    gap: 10,
    marginTop: 6,
  },
  exerciseHeading: {
    color: "#F7F2E7",
    fontSize: 16,
    fontWeight: "800",
  },
  exerciseSubheading: {
    color: "#8A7E6C",
    fontSize: 13,
    marginBottom: 4,
  },
  exerciseCard: {
    borderWidth: 1,
    borderColor: "rgba(247,242,231,0.1)",
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  exerciseLine: {
    color: "#F7F2E7",
    fontSize: 14,
    fontStyle: "italic",
  },
  exerciseOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  exerciseOption: {
    borderWidth: 1,
    borderColor: "rgba(247,242,231,0.16)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  exerciseOptionCorrect: {
    backgroundColor: "rgba(111,183,172,0.18)",
    borderColor: "#6FB7AC",
  },
  exerciseOptionWrong: {
    backgroundColor: "rgba(232,146,126,0.16)",
    borderColor: "#E8927E",
  },
  exerciseOptionRevealCorrect: {
    borderColor: "#6FB7AC",
  },
  exerciseOptionText: {
    color: "#F7F2E7",
    fontSize: 13,
    fontWeight: "600",
  },
});
