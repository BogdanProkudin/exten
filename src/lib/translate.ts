interface MyMemoryResponse {
  responseData: {
    translatedText: string;
    match: number;
  };
  responseStatus: number;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 6000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw e;
  }
}

async function tryMyMemory(word: string, lang: string): Promise<string> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", word);
  url.searchParams.set("langpair", `en|${lang}`);

  const res = await fetchWithTimeout(url.toString(), {}, 6000);
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);

  const data: MyMemoryResponse = await res.json();
  if (data.responseStatus !== 200) {
    throw new Error(`MyMemory API error: ${data.responseStatus}`);
  }

  const translation = data.responseData.translatedText;

  // Guard: reject if the API echoes back the input unchanged
  if (translation.toLowerCase().trim() === word.toLowerCase().trim()) {
    throw new Error("MyMemory returned input unchanged");
  }

  return translation;
}

async function tryLibreTranslate(
  word: string,
  lang: string,
): Promise<string> {
  const res = await fetchWithTimeout(
    "https://libretranslate.com/translate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: word,
        source: "en",
        target: lang,
      }),
    },
    6000,
  );

  if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);

  const data = (await res.json()) as { translatedText?: string };
  if (!data.translatedText) {
    throw new Error("LibreTranslate returned no translation");
  }

  return data.translatedText;
}

async function tryGoogleTranslate(
  word: string,
  lang: string,
): Promise<string> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", lang);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", word);

  const res = await fetchWithTimeout(url.toString(), {}, 6000);
  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`);

  // Response is nested arrays: [[["translated","original",...],...],...]
  const data = await res.json();
  const translation = data?.[0]
    ?.map((segment: [string]) => segment[0])
    .join("");

  if (!translation) {
    throw new Error("Google Translate returned no translation");
  }

  if (translation.toLowerCase().trim() === word.toLowerCase().trim()) {
    throw new Error("Google Translate returned input unchanged");
  }

  return translation;
}

async function getTargetLang(): Promise<string> {
  try {
    const data = await chrome.storage.sync.get("targetLang") as { targetLang?: string };
    return data.targetLang || "ru";
  } catch {
    return "ru";
  }
}

export async function translateWord(
  word: string,
  targetLang?: string,
): Promise<string> {
  const lang = targetLang ?? await getTargetLang();
  // Try MyMemory first
  try {
    return await tryMyMemory(word, lang);
  } catch {
    // Fall through
  }

  // Try LibreTranslate as fallback
  try {
    return await tryLibreTranslate(word, lang);
  } catch {
    // Fall through
  }

  // Try Google Translate as last resort
  try {
    return await tryGoogleTranslate(word, lang);
  } catch {
    // All failed
  }

  throw new Error("All translation services failed");
}
