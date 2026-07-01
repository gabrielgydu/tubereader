"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

export const FONTS = [
  { id: "geist", label: "Geist", css: "var(--font-geist-sans)" },
  { id: "inter", label: "Inter", css: "var(--font-inter)" },
  { id: "source-serif", label: "Source Serif", css: "var(--font-source-serif)" },
  { id: "literata", label: "Literata", css: "var(--font-literata)" },
  { id: "ibm-plex-serif", label: "IBM Plex Serif", css: "var(--font-ibm-plex-serif)" },
] as const;

export type FontId = (typeof FONTS)[number]["id"];

const FONT_SIZES = [13, 14, 15, 16, 18, 24] as const;
export type FontSize = (typeof FONT_SIZES)[number];

interface ReadingSettings {
  font: FontId;
  fontSize: FontSize;
  setFont: (f: FontId) => void;
  setFontSize: (s: FontSize) => void;
  fontCss: string;
}

const ReadingSettingsContext = createContext<ReadingSettings>({
  font: "inter",
  fontSize: 15,
  setFont: () => {},
  setFontSize: () => {},
  fontCss: "var(--font-inter)",
});

export function useReadingSettings() {
  return useContext(ReadingSettingsContext);
}

function load(): { font: FontId; fontSize: FontSize } {
  if (typeof window === "undefined") return { font: "inter", fontSize: 15 };
  try {
    const raw = localStorage.getItem("tubereader-reading");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { font: "inter", fontSize: 15 };
}

function save(font: FontId, fontSize: FontSize) {
  localStorage.setItem(
    "tubereader-reading",
    JSON.stringify({ font, fontSize })
  );
}

export function ReadingSettingsProvider({ children }: { children: ReactNode }) {
  const [font, setFontState] = useState<FontId>("inter");
  const [fontSize, setFontSizeState] = useState<FontSize>(15);

  useEffect(() => {
    const saved = load();
    setFontState(saved.font);
    setFontSizeState(saved.fontSize);
  }, []);

  function setFont(f: FontId) {
    setFontState(f);
    save(f, fontSize);
  }

  function setFontSize(s: FontSize) {
    setFontSizeState(s);
    save(font, s);
  }

  const fontCss = FONTS.find((f) => f.id === font)?.css || FONTS[0].css;

  return (
    <ReadingSettingsContext.Provider
      value={{ font, fontSize, setFont, setFontSize, fontCss }}
    >
      {children}
    </ReadingSettingsContext.Provider>
  );
}

export { FONT_SIZES };
