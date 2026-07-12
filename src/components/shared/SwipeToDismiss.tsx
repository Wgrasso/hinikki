// src/components/shared/SwipeToDismiss.tsx — swipe a row left to reveal a red trash button, tap
// it to remove that row. Built on the built-in PanResponder + Animated (no extra native dep).
import React, { useRef } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Icon } from "../../primitives";

const ACTION_WIDTH = 88;

export default function SwipeToDismiss({
  children,
  onDismiss,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onDismiss: () => void;
  accessibilityLabel: string;
}): React.ReactElement {
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const settle = (open: boolean): void => {
    openRef.current = open;
    // A gentle, quick glide to the resting position (open or closed) — no bounce.
    Animated.spring(translateX, { toValue: open ? -ACTION_WIDTH : 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
  };

  const responder = useRef(
    PanResponder.create({
      // Claim a drag as soon as it's more horizontal than vertical (low threshold), so even a slow
      // sideways pull is picked up smoothly instead of being read as a scroll.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3 && Math.abs(g.dx) > Math.abs(g.dy),
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 3 && Math.abs(g.dx) > Math.abs(g.dy),
      // Once we own the gesture, don't let the surrounding scroll view yank it back mid-slide —
      // that hand-off is what made slow drags stutter.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_e, g) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        let x = base + g.dx;
        if (x > 0) x = 0; // don't pull right past closed
        if (x < -ACTION_WIDTH - 32) x = -ACTION_WIDTH - 32; // a little rubber-banding
        translateX.setValue(x);
      },
      onPanResponderRelease: (_e, g) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        const x = base + g.dx;
        // Open on a flick (fast leftward), or once pulled a bit more than a third of the way —
        // so a slow, short pull still reveals the trash instead of snapping shut.
        settle(g.vx < -0.25 || x < -ACTION_WIDTH * 0.35);
      },
      onPanResponderTerminate: () => settle(openRef.current),
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.action}
        onPress={() => {
          settle(false);
          onDismiss();
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Icon name="trash" color="onPrimary" size={theme.iconSize.md} />
      </Pressable>
      <Animated.View style={[styles.content, { transform: [{ translateX }] }]} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", overflow: "hidden", borderRadius: theme.radius.md },
  // Opaque background so the red action stays fully hidden at rest (even behind the card's
  // rounded corners) and is revealed only as the row slides — like Spotify's remove-from-playlist.
  content: { backgroundColor: theme.colors.background },
  action: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    backgroundColor: theme.colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
  },
});
