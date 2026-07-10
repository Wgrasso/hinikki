// src/components/admin/DateTimePickerField.tsx — a themed, Field-styled row that opens the native
// date or time picker (@react-native-community/datetimepicker) on tap.
// Android: our own Pressable opens the OS's modal dialog (mount-on-open, unmount-on-select).
// iOS: display="compact" — Apple's own small date/time chip (as in Reminders/Calendar) that pops
// up an OS-positioned popover on tap. Two of these can sit side by side (Start/End time) and can
// never overlap or get clipped by our layout, since iOS — not us — positions the popover. An
// earlier version used display="inline"/"spinner" embedded in our own layout, which broke exactly
// that way when Start and End were placed in a half-width row.
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { theme } from "../../theme";
import { Icon, Text } from "../../primitives";
import { formatTime } from "../../utils/format";

type PickerMode = "date" | "time";

type Props = {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  mode: PickerMode;
  initialValue: Date;
  placeholder: string;
  error?: string | null;
  onClear?: () => void;
};

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export default function DateTimePickerField({
  label,
  value,
  onChange,
  mode,
  initialValue,
  placeholder,
  error,
  onClear,
}: Props): React.ReactElement {
  const [androidOpen, setAndroidOpen] = useState(false);

  // First tap on an unset field: give it a starting value: also open Android's dialog in the
  // same tap (matches the one-tap flow it always had); iOS reveals its compact chip, which the
  // admin can tap again to actually change the value via its own popover.
  function activate(): void {
    onChange(initialValue);
    if (Platform.OS === "android") setAndroidOpen(true);
  }

  return (
    <View style={styles.wrap}>
      <Text variant="overline" tone="textSecondary" style={styles.label}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.field, error ? styles.errored : null]}>
        <Icon name={mode === "date" ? "calendar" : "clock"} size={theme.iconSize.sm} color="textSecondary" />
        {!value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={activate} style={styles.value}>
            <Text variant="body" tone="textTertiary">
              {placeholder}
            </Text>
          </Pressable>
        ) : Platform.OS === "android" ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setAndroidOpen(true)} style={styles.value}>
              <Text variant="body" tone="textPrimary">
                {mode === "date" ? formatDate(value) : formatTime(value.toISOString())}
              </Text>
            </Pressable>
            {androidOpen ? (
              <DateTimePicker
                value={value}
                mode={mode}
                display="default"
                onValueChange={(_event, selected) => {
                  setAndroidOpen(false);
                  onChange(selected);
                }}
                onDismiss={() => setAndroidOpen(false)}
              />
            ) : null}
          </>
        ) : (
          <DateTimePicker
            value={value}
            mode={mode}
            display="compact"
            accentColor={theme.colors.primary}
            onValueChange={(_event, selected) => onChange(selected)}
          />
        )}
        {onClear && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={onClear} hitSlop={8}>
            <Icon name="close" size={theme.iconSize.sm} color="textTertiary" />
          </Pressable>
        ) : null}
      </View>
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
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    minHeight: 56,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
  },
  value: { flex: 1 },
  errored: { borderColor: theme.colors.danger },
  error: { marginLeft: theme.spacing.xs },
});
