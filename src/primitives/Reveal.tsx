// src/primitives/Reveal.tsx — the app-wide reveal convention: content fades + rises in on mount,
// using theme.motion only. Fully correct with zero motion (reduce-motion safe).
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, ViewStyle } from "react-native";
import { theme } from "../theme";

type RevealProps = {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
};

export default function Reveal({ children, delay = 0, style }: RevealProps): React.ReactElement {
  const progress = useRef(new Animated.Value(theme.motion.reveal.opacityFrom)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (active) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => setReduceMotion(on));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: theme.motion.durationBase,
      delay,
      easing: theme.motion.ease,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, reduceMotion, delay]);

  const translateY = progress.interpolate({
    inputRange: [theme.motion.reveal.opacityFrom, 1],
    outputRange: [theme.motion.reveal.translateY, 0],
  });

  return (
    <Animated.View style={[{ opacity: progress, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
