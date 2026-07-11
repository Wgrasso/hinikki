// src/components/admin/QuickAddModal.tsx — a small, reusable add/edit form (safe place, contact, etc.).
import React, { useEffect, useState } from "react";
import { KeyboardTypeOptions, StyleSheet } from "react-native";
import { theme } from "../../theme";
import { Button, Field, Stack } from "../../primitives";
import BottomSheetModal from "../shared/BottomSheetModal";
import { useT } from "../../i18n";

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
  initialValues?: Record<string, string>;
  submitLabel?: string;
  note?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
};

export default function QuickAddModal({ visible, title, fields, initialValues, submitLabel, note, onClose, onSubmit }: Props): React.ReactElement {
  const { t } = useT();
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current values each time the sheet opens: empty for "add", prefilled for "edit".
  useEffect(() => {
    if (visible) {
      setValues(initialValues ?? {});
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function setValue(key: string, value: string): void {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit(): Promise<void> {
    const missing = fields.find((f) => f.required && !(values[f.key] ?? "").trim());
    if (missing) {
      setError(t("adminForms.quickAdd.required", { field: missing.label.toLowerCase() }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
      onClose();
    } catch {
      setError(t("adminForms.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title={title} subtitle={note}>
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
        <Button label={submitLabel ?? t("common.save")} icon="check" loading={saving} onPress={submit} />
        <Button label={t("common.cancel")} variant="secondary" onPress={onClose} />
      </Stack>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: theme.spacing.sm },
});
