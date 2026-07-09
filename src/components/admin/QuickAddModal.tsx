// src/components/admin/QuickAddModal.tsx — a small, reusable add form (safe place, contact, etc.).
import React, { useState } from "react";
import { KeyboardTypeOptions, Modal, ScrollView, StyleSheet, View } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Stack, Text } from "../../primitives";

export type QuickField = {
  key: string;
  label: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  required?: boolean;
};

type Props = {
  visible: boolean;
  title: string;
  fields: QuickField[];
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
};

export default function QuickAddModal({ visible, title, fields, onClose, onSubmit }: Props): React.ReactElement {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setValue(key: string, value: string): void {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit(): Promise<void> {
    const missing = fields.find((f) => f.required && !(values[f.key] ?? "").trim());
    if (missing) {
      setError(`Please enter ${missing.label.toLowerCase()}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
      setValues({});
      onClose();
    } catch {
      setError("We could not save just now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text variant="title">{title}</Text>
            {fields.map((f, index) => (
              <Field
                key={f.key}
                label={f.label}
                value={values[f.key] ?? ""}
                onChangeText={(v) => setValue(f.key, v)}
                placeholder={f.placeholder}
                keyboardType={f.keyboardType}
                error={index === 0 ? error : null}
              />
            ))}
            <Stack gap="sm" style={styles.actions}>
              <Button label="Save" icon="check" loading={saving} onPress={submit} />
              <Button label="Cancel" variant="secondary" onPress={onClose} />
            </Stack>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, maxHeight: "92%", paddingTop: theme.spacing.md },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.border, marginBottom: theme.spacing.sm },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  actions: { marginTop: theme.spacing.sm },
});
