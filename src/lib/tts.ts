// Text-to-Speech utility with multiple engine support:
// - "google"  — Google Translate TTS (free, natural)
// - "openai"  — OpenAI TTS API (premium, very human-like)
// - "browser" — Web Speech API (offline, system voices)

export type TtsEngine = "google" | "openai" | "browser";
export type OpenAIVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export interface TtsSettings {
  engine: TtsEngine;
  // Browser engine
  voiceURI: string | null;
  pitch: number;  // 0.5–1.5, browser only
  // All engines
  rate: number;   // 0.5–1.5
  // OpenAI engine
  openaiVoice: OpenAIVoice;
}

const DEFAULT_SETTINGS: TtsSettings = {
  engine: "google",
  voiceURI: null,
  rate: 0.9,
  pitch: 1.0,
  openaiVoice: "nova",
};

let cachedSettings: TtsSettings | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;

// --------------- Settings persistence ---------------

export async function loadTtsSettings(): Promise<TtsSettings> {
  try {
    const data = await chrome.storage.sync.get("ttsSettings");
    cachedSettings = data.ttsSettings
      ? { ...DEFAULT_SETTINGS, ...data.ttsSettings }
      : { ...DEFAULT_SETTINGS };
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

export async function saveTtsSettings(settings: TtsSettings): Promise<void> {
  cachedSettings = settings;
  await chrome.storage.sync.set({ ttsSettings: settings });
}

async function getOpenAIKey(): Promise<string | null> {
  try {
    const data = await chrome.storage.local.get("openaiApiKey");
    return (data.openaiApiKey as string) || null;
  } catch {
    return null;
  }
}

// --------------- Google Translate TTS ---------------

function googleTtsUrl(text: string, rate: number): string {
  const speed = rate < 0.7 ? 0.3 : rate > 1.2 ? 1 : 0.5;
  return `https://translate.googleapis.com/translate_tts?client=gtx&tl=en&q=${encodeURIComponent(text)}&ttsspeed=${speed}`;
}

async function speakGoogle(text: string, rate: number): Promise<void> {
  stopSpeaking();
  // Google TTS has a ~200 char limit per request; for vocabulary words this is fine
  const url = googleTtsUrl(text.slice(0, 200), rate);
  const audio = new Audio(url);
  currentAudio = audio;

  return new Promise((resolve, reject) => {
    audio.onended = () => { currentAudio = null; resolve(); };
    audio.onerror = () => { currentAudio = null; reject(new Error("Google TTS failed")); };
    audio.playbackRate = rate > 1.2 ? 1.3 : rate < 0.7 ? 0.7 : 1;
    audio.play().catch((e) => { currentAudio = null; reject(e); });
  });
}

// --------------- OpenAI TTS ---------------

async function speakOpenAI(text: string, voice: OpenAIVoice, rate: number): Promise<void> {
  stopSpeaking();
  const apiKey = await getOpenAIKey();
  if (!apiKey) throw new Error("OpenAI API key not configured. Add it in Settings.");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice,
      input: text,
      speed: Math.max(0.25, Math.min(4.0, rate)),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`OpenAI TTS error: ${err}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;

  return new Promise((resolve, reject) => {
    audio.onended = () => { currentAudio = null; URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { currentAudio = null; URL.revokeObjectURL(url); reject(new Error("OpenAI TTS playback failed")); };
    audio.play().catch((e) => { currentAudio = null; URL.revokeObjectURL(url); reject(e); });
  });
}

// --------------- Browser (Web Speech API) ---------------

async function ensureVoices(): Promise<SpeechSynthesisVoice[]> {
  let voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) return voices;

  await new Promise<void>((res) => {
    const handler = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      res();
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      res();
    }, 500);
  });
  return window.speechSynthesis.getVoices();
}

export async function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = await ensureVoices();
  return voices
    .filter((v) => v.lang.startsWith("en"))
    .sort((a, b) => {
      if (a.localService !== b.localService) return a.localService ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function resolveVoice(voices: SpeechSynthesisVoice[], settings: TtsSettings): SpeechSynthesisVoice | undefined {
  if (settings.voiceURI) {
    const match = voices.find((v) => v.voiceURI === settings.voiceURI);
    if (match) return match;
  }
  return voices.find((v) => v.lang.startsWith("en") && v.localService)
    || voices.find((v) => v.lang.startsWith("en"));
}

async function speakBrowser(text: string, settings: TtsSettings): Promise<void> {
  const voices = await ensureVoices();

  return new Promise((resolve, reject) => {
    if (currentUtterance) window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = 1;

    const voice = resolveVoice(voices, settings);
    if (voice) utterance.voice = voice;

    utterance.onend = () => { currentUtterance = null; resolve(); };
    utterance.onerror = (e) => { currentUtterance = null; reject(e); };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

// --------------- Public API ---------------

export async function speak(text: string, _lang: string = "en-US"): Promise<void> {
  const settings = cachedSettings ?? await loadTtsSettings();

  switch (settings.engine) {
    case "google":
      return speakGoogle(text, settings.rate);
    case "openai":
      return speakOpenAI(text, settings.openaiVoice, settings.rate);
    case "browser":
      return speakBrowser(text, settings);
  }
}

export async function playPreview(text: string, settings: TtsSettings): Promise<void> {
  switch (settings.engine) {
    case "google":
      return speakGoogle(text, settings.rate);
    case "openai":
      return speakOpenAI(text, settings.openaiVoice, settings.rate);
    case "browser":
      return speakBrowser(text, settings);
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return window.speechSynthesis.speaking || (currentAudio !== null && !currentAudio.paused);
}
