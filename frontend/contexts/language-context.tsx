"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "zh" | "en";

export interface LanguageText {
  zh: string;
  en: string;
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  translate: (text: LanguageText | string) => string;
}

const LANGUAGE_STORAGE_KEY = "custom-tee-language";

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined
);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("zh");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) as
      | Language
      | null;
    if (stored === "zh" || stored === "en") {
      setLanguageState(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((value: Language) => {
    setLanguageState(value);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => (prev === "zh" ? "en" : "zh"));
  }, []);

  const translate = useCallback(
    (text: LanguageText | string) => {
      if (typeof text === "string") {
        return text;
      }
      return text[language];
    },
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, translate }),
    [language, setLanguage, toggleLanguage, translate]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
