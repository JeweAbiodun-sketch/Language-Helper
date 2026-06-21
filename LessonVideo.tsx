import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";

type LessonVideoProps = {
  videoId: string;
  title: string;
};

const VIDEO_HEIGHT = 200;

export default function LessonVideo({ videoId, title }: LessonVideoProps) {
  const [playing, setPlaying] = useState(false);

  if (!videoId) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Video coming soon</Text>
        <Text style={styles.placeholderText}>
          This lesson doesn't have a matching video yet. Add the YouTube video
          id to this lesson's entry in lessonContent.ts to embed it here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <YoutubePlayer
        height={VIDEO_HEIGHT}
        play={playing}
        videoId={videoId}
        onChangeState={(state: string) => {
          if (state === "ended") setPlaying(false);
        }}
      />
      <Pressable
        onPress={() =>
          Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`)
        }
      >
        <Text style={styles.openLink}>Open "{title}" on YouTube</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  openLink: {
    color: "#BFD0FF",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 8,
    backgroundColor: "#101B2E",
  },
  placeholder: {
    backgroundColor: "#162640",
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.18)",
    padding: 16,
    gap: 6,
  },
  placeholderTitle: {
    color: "#F6F9FF",
    fontSize: 15,
    fontWeight: "700",
  },
  placeholderText: {
    color: "#9AAAC6",
    fontSize: 13,
    lineHeight: 19,
  },
});
