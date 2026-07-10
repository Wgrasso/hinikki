// src/components/shared/BottomSheetModal.tsx — shared chrome for every add/edit bottom sheet
// (person, memory, event/reminder, proposal, quick-add, etc.). Backdrop + sheet + drag handle +
// scrollable body, with swipe-to-dismiss built in, implemented once so every sheet behaves
// identically instead of each screen re-implementing (and subtly diverging on) the same gesture.
//
// The header (handle + title + optional subtitle) is the ONLY drag zone — it never competes with
// the ScrollView for the touch, which is what made per-screen swipe attempts fire only
// intermittently. It claims the touch at onStartShouldSetPanResponder rather than waiting for
// onMoveShouldSetPanResponder to win a move-time negotiation, which does not reliably fire for
// views inside a Modal's surface on the new architecture.
import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Modal, PanResponder, Pressable, ScrollView, ScrollViewProps, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Text } from "../../primitives";

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  scrollViewProps?: Partial<ScrollViewProps>;
  maxHeightPercent?: number;
};

export default function BottomSheetModal({ visible, title, subtitle, onClose, children, scrollViewProps, maxHeightPercent = 92 }: Props): React.ReactElement {
  const screenHeight = Dimensions.get("window").height;
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, screenHeight],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  // Keep the responder's close callback current without recreating the responder each render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const springBack = () => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: false }).start();
  };
  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && g.dy > Math.abs(g.dx),
      // Don't let the scroll view or modal machinery steal the gesture mid-drag.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        // useNativeDriver is false on purpose: the backdrop opacity is a JS-driven interpolation of
        // this same value, and mixing a native-driven animation with a JS-driven consumer silently
        // freezes the node so the drag stops moving. Keep every use of translateY on the JS side.
        if (g.dy > 120 || g.vy > 0.6) {
          Animated.timing(translateY, {
            toValue: screenHeight,
            duration: 200,
            useNativeDriver: false,
          }).start(() => onCloseRef.current());
        } else {
          springBack();
        }
      },
      // If the OS forcibly takes the touch away (e.g. an incoming call sheet), don't leave the
      // sheet stranded half-dragged.
      onPanResponderTerminate: springBack,
    }),
  ).current;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { maxHeight: `${maxHeightPercent}%`, transform: [{ translateY }] }]}>
          {/* Drag handle + title form the grab zone; dragging it down dismisses the sheet. */}
          <View style={styles.header} {...dragResponder.panHandlers}>
            <View style={styles.handle} />
            <Text variant="title">{title}</Text>
            {subtitle ? (
              <Text variant="body" tone="textSecondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} {...scrollViewProps}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.overlay },
  sheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, paddingTop: theme.spacing.md },
  // The whole header is the drag grab zone — a generous target that never fights the ScrollView.
  header: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: theme.spacing.sm },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.border, marginBottom: theme.spacing.sm },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
});
