"use client";

import React, { createContext, useContext, useState } from "react";

export interface LanguageOption {
  code: string;
  nativeName: string;
  englishName: string;
  locale: string;
  starterPrompt: string;
}

export const LANGUAGES: LanguageOption[] = [
  {
    code: "en",
    nativeName: "English",
    englishName: "English",
    locale: "en-IN",
    starterPrompt: "I need a dermatologist in Pune tomorrow at 10 AM",
  },
  {
    code: "hi",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    locale: "hi-IN",
    starterPrompt: "मुझे कल पुणे में त्वचा विशेषज्ञ (dermatologist) से मिलना है",
  },
  {
    code: "mr",
    nativeName: "मराठी",
    englishName: "Marathi",
    locale: "mr-IN",
    starterPrompt: "मला उद्या पुण्यात स्किन स्पेशालिस्ट (dermatologist) कडे अपॉइंटमेंट हवी आहे",
  },
];

interface LanguageContextType {
  currentLanguage: LanguageOption;
  setLanguageByCode: (code: string) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  currentLanguage: LANGUAGES[0],
  setLanguageByCode: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [currentLanguage, setCurrentLanguage] = useState<LanguageOption>(
    LANGUAGES[0]
  );

  const setLanguageByCode = (code: string) => {
    const found = LANGUAGES.find((l) => l.code === code);
    if (found) setCurrentLanguage(found);
  };

  return (
    <LanguageContext.Provider value={{ currentLanguage, setLanguageByCode }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
