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
    Animated.spring(translateX, { toValue: open ? -ACTION_WIDTH : 0, useNativeDriver: true, bounciness: 0 }).start();
  };

  const responder = useRef(
    PanResponder.create({
      // Only claim clearly-horizontal drags, so vertical scrolling still works.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_e, g) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        let x = base + g.dx;
        if (x > 0) x = 0; // don't pull right past closed
        if (x < -ACTION_WIDTH - 32) x = -ACTION_WIDTH - 32; // a little rubber-banding
        translateX.setValue(x);
      },
      onPanResponderRelease: (_e, g) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        settle(base + g.dx < -ACTION_WIDTH / 2);
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
      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", overflow: "hidden", borderRadius: theme.radius.md },
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
