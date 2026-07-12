// src/primitives/Field.tsx — a labeled, themed text input with focus + error states.
import React, { useRef, useState } from "react";
import { KeyboardTypeOptions, StyleSheet, TextInput, View } from "react-native";
import { theme } from "../theme";
import Text from "./Text";

// A placeholder like "e.g. Alex" (or Dutch "bijv. Alex") is a worked example. Return the value
// with the "e.g."/"bijv." lead-in stripped, or null if the placeholder isn't an example — so we
// only ever autofill genuine suggestions, never labels like "Optional".
export function suggestionFrom(placeholder?: string): string | null {
  if (!placeholder) return null;
  // Require a real separator (space/comma) after the lead-in, so "e.g." on its own — or a word
  // that merely starts with those letters — never counts as a suggestion.
  const match = placeholder.match(/^\s*(?:e\.?g\.?|bijv\.?|bijvoorbeeld|b\.?v\.?)[\s,]+(.+)$/i);
  const suggestion = match?.[1]?.trim();
  return suggestion ? suggestion : null;
}

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
  // Synchronous focus flag: onPressIn fires before onFocus, so on the FIRST tap this is still
  // false; a SECOND tap on the already-focused, still-empty field lands here as true.
  const focusedRef = useRef(false);
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
        onFocus={() => {
          setFocused(true);
          focusedRef.current = true;
        }}
        onBlur={() => {
          setFocused(false);
          focusedRef.current = false;
        }}
        onPressIn={() => {
          // Tap an already-focused, still-empty field again → accept the suggested example.
          if (!focusedRef.current || value.length > 0) return;
          const suggestion = suggestionFrom(placeholder);
          if (suggestion) onChangeText(suggestion);
        }}
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
