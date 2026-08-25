// ISO 639-1 code → English name of the language.
// Models produce noticeably better output when told "Russian" instead of "ru".

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ru: "Russian",
  uk: "Ukrainian",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  pl: "Polish",
  tr: "Turkish",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
};

export function languageName(code: string | undefined): string {
  if (!code) return "English";
  return LANGUAGE_NAMES[code] ?? code;
}
