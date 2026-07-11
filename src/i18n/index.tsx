// src/i18n/index.tsx — the app's translation layer. One "current UI language" is resolved
// from context: in USER mode it follows the older adult's own language (their profile), in
// ADMIN mode it follows the admin's own device preference. Default English.
// Screens call const { t } = useT() and render t("some.key"). String tables live in ./dict/*.
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAppState } from "../auth/appState";
import { getOlderAdult } from "../services/profileService";
import { getAdminLanguage, setAdminLanguage } from "../storage/localStore";
import { common } from "./dict/common";
import { user } from "./dict/user";
import { onboarding } from "./dict/onboarding";

export type Lang = "en" | "nl";

// Every dict module contributes { en, nl }; merged into one lookup per language.
const merged: Record<Lang, Record<string, string>> = {
  en: { ...common.en, ...user.en, ...onboarding.en },
  nl: { ...common.nl, ...user.nl, ...onboarding.nl },
};

type LanguageValue = {
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  setAppLanguage: (lang: Lang) => Promise<void>; // admin's own UI language
};

const LanguageContext = createContext<LanguageValue | null>(null);

function toLang(primary: string | null | undefined): Lang {
  return primary && primary.startsWith("nl") ? "nl" : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { mode, olderAdultId } = useAppState();
  const [elderLang, setElderLang] = useState<Lang>("en");
  const [adminLang, setAdminLang] = useState<Lang>("en");

  // Admin's own device preference.
  useEffect(() => {
    void getAdminLanguage().then(setAdminLang);
  }, []);

  // The older adult's language follows their profile (set by the family).
  useEffect(() => {
    if (mode !== "user" || !olderAdultId) return;
    let cancelled = false;
    void getOlderAdult(olderAdultId)
      .then((oa) => {
        if (!cancelled) setElderLang(toLang(oa?.primary_language));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mode, olderAdultId]);

  const lang: Lang = mode === "user" ? elderLang : adminLang;

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>): string => {
      let s = merged[lang][key] ?? merged.en[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      return s;
    };
  }, [lang]);

  const setAppLanguage = async (next: Lang): Promise<void> => {
    await setAdminLanguage(next);
    setAdminLang(next);
  };

  const value = useMemo<LanguageValue>(() => ({ lang, t, setAppLanguage }), [lang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT(): LanguageValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used within LanguageProvider");
  return ctx;
}
