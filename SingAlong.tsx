import React, { useEffect, useRef, useState } from "react";
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
            {section.lines.map((line, index) => (
              <Text key={index} style={styles.lyricLine}>
                {line}
              </Text>
            ))}
          </View>
        ))}
      </View>
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
    color: "#F7F2E7",
    fontSize: 16,
    lineHeight: 25,
  },
});
