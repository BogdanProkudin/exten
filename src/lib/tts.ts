// Text-to-Speech utility using Web Speech API

let currentUtterance: SpeechSynthesisUtterance | null = null;

export async function speak(text: string, lang: string = "en-US"): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Cancel any ongoing speech
    if (currentUtterance) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9; // Slightly slower for learning
    utterance.pitch = 1;
    utterance.volume = 1;

    // Try to find a good voice (voices may load async in Chrome)
    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      // Wait for voices to load (Chrome fires voiceschanged async)
      await new Promise<void>((res) => {
        const handler = () => {
          window.speechSynthesis.removeEventListener("voiceschanged", handler);
          res();
        };
        window.speechSynthesis.addEventListener("voiceschanged", handler);
        // Fallback timeout — don't block forever
        setTimeout(() => {
          window.speechSynthesis.removeEventListener("voiceschanged", handler);
          res();
        }, 500);
      });
      voices = window.speechSynthesis.getVoices();
    }
    const preferredVoice = voices.find(
      (v) => v.lang.startsWith(lang.split("-")[0]) && v.localService
    ) || voices.find((v) => v.lang.startsWith("en"));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
      currentUtterance = null;
      resolve();
    };

    utterance.onerror = (e) => {
      currentUtterance = null;
      reject(e);
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return window.speechSynthesis.speaking;
}

// Preload voices (needed on some browsers)
export function preloadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    
    // Timeout fallback
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
  });
}
