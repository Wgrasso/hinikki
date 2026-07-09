// src/primitives/Stack.tsx — layout primitive. Removes bare margins/paddings from screens.
import React from "react";
import { View, ViewStyle } from "react-native";
import { theme } from "../theme";
import type { SpacingKey } from "../theme";

type StackProps = {
  children: React.ReactNode;
  direction?: "row" | "column";
  gap?: SpacingKey;
  align?: ViewStyle["alignItems"];
  justify?: ViewStyle["justifyContent"];
  padding?: SpacingKey;
  style?: ViewStyle;
  flex?: boolean;
  wrap?: boolean;
};

export default function Stack({
  children,
  direction = "column",
  gap,
  align,
  justify,
  padding,
  style,
  flex = false,
  wrap = false,
}: StackProps): React.ReactElement {
  return (
    <View
      style={[
        {
          flexDirection: direction,
          gap: gap ? theme.spacing[gap] : undefined,
          alignItems: align,
          justifyContent: justify,
          padding: padding ? theme.spacing[padding] : undefined,
          flexWrap: wrap ? "wrap" : "nowrap",
        },
        flex ? { flex: 1 } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
