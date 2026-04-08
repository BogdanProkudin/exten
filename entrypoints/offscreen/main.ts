// Offscreen document for TTS audio playback.
// Content scripts can't play audio on pages with strict CSP,
// so we route TTS through this offscreen document which has full DOM access.

import { speak, stopSpeaking } from "../../src/lib/tts";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  if (message.type === "SPEAK_WORD") {
    speak(message.word)
      .then(() => sendResponse({ ok: true }))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message }));
    return true; // keep channel open for async response
  }

  if (message.type === "STOP_SPEAKING") {
    stopSpeaking();
    sendResponse({ ok: true });
  }
});
