// src/components/admin/DateNavigator.tsx — a MyFitnessPal-style day bar: ‹ prev · [label] · next ›.
// The label reads Today / Yesterday / Tomorrow, otherwise the full date. Tapping it opens the
// phone's native date wheel. Uses @react-native-community/datetimepicker (a native module —
// needs to be in the dev build, same as the schedule form's picker).
import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { theme } from "../../theme";
import { Button, Icon, Text } from "../../primitives";
import { useT } from "../../i18n";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export default function DateNavigator({ date, onChange }: { date: Date; onChange: (d: Date) => void }): React.ReactElement {
  const { t, lang } = useT();
  const [showPicker, setShowPicker] = useState(false);

  const today = new Date();
  const label = sameDay(date, today)
    ? t("date.today")
    : sameDay(date, addDays(today, -1))
      ? t("date.yesterday")
      : sameDay(date, addDays(today, 1))
        ? t("date.tomorrow")
        : date.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long" });

  const onAndroidPick = (event: DateTimePickerEvent, picked?: Date): void => {
    setShowPicker(false);
    if (event.type === "set" && picked) onChange(startOfDay(picked));
  };

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("date.prevDay")}
        onPress={() => onChange(addDays(date, -1))}
        hitSlop={12}
        style={({ pressed }) => [styles.arrow, pressed ? styles.pressed : null]}
      >
        <Icon name="back" color="primary" size={theme.iconSize.md} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("date.pickDay")}
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => [styles.center, pressed ? styles.pressed : null]}
      >
        <Text variant="bodyStrong">{label}</Text>
        <Icon name="calendar" color="textTertiary" size={theme.iconSize.sm} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("date.nextDay")}
        onPress={() => onChange(addDays(date, 1))}
        hitSlop={12}
        style={({ pressed }) => [styles.arrow, pressed ? styles.pressed : null]}
      >
        <Icon name="chevron" color="primary" size={theme.iconSize.md} />
      </Pressable>

      {/* Android shows its own dialog; iOS gets the wheel in a small sheet with Done. */}
      {showPicker && Platform.OS === "android" ? (
        <DateTimePicker value={date} mode="date" onChange={onAndroidPick} />
      ) : null}
      {showPicker && Platform.OS !== "android" ? (
        <Modal transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
          <Pressable style={styles.overlay} onPress={() => setShowPicker(false)}>
            <View style={styles.sheet}>
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                onChange={(_e, picked) => picked && onChange(startOfDay(picked))}
              />
              <Button label={t("date.done")} icon="check" onPress={() => setShowPicker(false)} />
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  arrow: { padding: theme.spacing.sm },
  center: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  pressed: { opacity: 0.6 },
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    alignItems: "center",
  },
});
