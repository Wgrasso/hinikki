// src/primitives/Field.tsx — a labeled, themed text input with focus + error states.
import React, { useState } from "react";
import { KeyboardTypeOptions, StyleSheet, TextInput, View } from "react-native";
import { theme } from "../theme";
import Text from "./Text";

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words";
  multiline?: boolean;
};

export default function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize = "sentences",
  multiline = false,
}: FieldProps): React.ReactElement {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="overline" tone="textSecondary" style={styles.label}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        style={[
          styles.input,
          multiline ? styles.multiline : null,
          focused ? styles.focused : null,
          error ? styles.errored : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error ? (
        <Text variant="caption" tone="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", gap: theme.spacing.xs },
  label: { marginLeft: theme.spacing.xs },
  input: {
    minHeight: 56,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    color: theme.colors.textPrimary,
    fontFamily: theme.text.body.fontFamily,
    fontSize: theme.text.body.fontSize,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  focused: { borderColor: theme.colors.primary },
  errored: { borderColor: theme.colors.danger },
  error: { marginLeft: theme.spacing.xs },
});
