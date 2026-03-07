export interface SpeechResult {
  transcript: string;
  confidence: number;
  isMatch: boolean;
}

export interface SpeechRecognitionOptions {
  lang?: string; // BCP-47 language tag, default "en-US"
  timeout?: number; // ms before giving up, default 5000
}

// Module-level reference to active recognition for cleanup
let activeRecognition: any = null;

/**
 * Check if the Web Speech API is available in this browser.
 */
export function isSpeechRecognitionSupported(): boolean {
  return !!(
    (window as any).webkitSpeechRecognition ||
    (window as any).SpeechRecognition
  );
}

/**
 * Simple Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Check if the transcript is a fuzzy match for the expected word.
 * Allow Levenshtein distance <= 1 for short words (<=4 chars), <= 2 for longer.
 */
function isFuzzyMatch(transcript: string, expected: string): boolean {
  const a = transcript.toLowerCase().trim();
  const b = expected.toLowerCase().trim();

  if (a === b) return true;

  const dist = levenshtein(a, b);
  const threshold = b.length <= 4 ? 1 : 2;

  return dist <= threshold;
}

/**
 * Start listening for speech and compare against an expected word.
 * Returns a promise that resolves with the speech result.
 */
export function startListening(
  expectedWord: string,
  options?: SpeechRecognitionOptions
): Promise<SpeechResult> {
  return new Promise((resolve, reject) => {
    if (!isSpeechRecognitionSupported()) {
      reject(new Error("Speech recognition is not supported in this browser."));
      return;
    }

    // Stop any previous recognition
    stopListening();

    const SpeechRecognitionCtor =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;

    const recognition = new SpeechRecognitionCtor();
    activeRecognition = recognition;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = options?.lang ?? "en-US";

    const timeout = options?.timeout ?? 5000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const settle = (resultOrError: SpeechResult | Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      activeRecognition = null;
      if (resultOrError instanceof Error) {
        reject(resultOrError);
      } else {
        resolve(resultOrError);
      }
    };

    recognition.onresult = (event: any) => {
      const result = event.results[0][0];
      const transcript = result.transcript?.trim() ?? "";
      const confidence = result.confidence ?? 0;
      const isMatch = isFuzzyMatch(transcript, expectedWord);

      settle({ transcript, confidence, isMatch });
    };

    recognition.onerror = (event: any) => {
      const errorMap: Record<string, string> = {
        "not-allowed": "Microphone access was denied.",
        "no-speech": "No speech was detected. Please try again.",
        "audio-capture": "No microphone was found.",
        network: "A network error occurred.",
        aborted: "Speech recognition was aborted.",
      };
      const message =
        errorMap[event.error] ??
        `Speech recognition error: ${event.error}`;
      settle(new Error(message));
    };

    recognition.onend = () => {
      // If recognition ends without a result or error, treat as no speech
      if (!settled) {
        settle(new Error("No speech was detected. Please try again."));
      }
    };

    // Start recognition
    try {
      recognition.start();
    } catch (e: any) {
      settle(new Error(e.message ?? "Failed to start speech recognition."));
      return;
    }

    // Timeout fallback
    timeoutId = setTimeout(() => {
      if (!settled) {
        try {
          recognition.stop();
        } catch (_) {
          // ignore
        }
        settle(new Error("No speech was detected. Please try again."));
      }
    }, timeout);
  });
}

/**
 * Stop any active speech recognition session.
 */
export function stopListening(): void {
  if (activeRecognition) {
    try {
      activeRecognition.stop();
    } catch (_) {
      // ignore - already stopped
    }
    activeRecognition = null;
  }
}
