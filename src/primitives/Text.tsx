// src/primitives/Text.tsx — typed text with variant + tone props. After this, no screen sets a
// bare fontSize/fontWeight/color again.
import React from "react";
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from "react-native";
import { theme } from "../theme";
import type { ColorRole, TextVariant } from "../theme";

type Props = RNTextProps & {
  variant?: TextVariant;
  tone?: ColorRole;
  center?: boolean;
};

export default function Text({ variant = "body", tone = "textPrimary", center = false, style, ...rest }: Props): React.ReactElement {
  return (
    <RNText
      style={[theme.text[variant], { color: theme.colors[tone] }, center ? styles.center : null, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: "center" },
});
