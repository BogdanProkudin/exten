import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface OnboardingProps {
  onComplete: (settings: { targetLang: string; userLevel: string; dailyGoal: number }) => void;
}

const LANGUAGES = [
  { code: "ru", name: "Russian", flag: "\u{1F1F7}\u{1F1FA}" },
  { code: "es", name: "Spanish", flag: "\u{1F1EA}\u{1F1F8}" },
  { code: "fr", name: "French", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "de", name: "German", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "it", name: "Italian", flag: "\u{1F1EE}\u{1F1F9}" },
  { code: "pt", name: "Portuguese", flag: "\u{1F1F5}\u{1F1F9}" },
  { code: "zh", name: "Chinese", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "ja", name: "Japanese", flag: "\u{1F1EF}\u{1F1F5}" },
  { code: "ko", name: "Korean", flag: "\u{1F1F0}\u{1F1F7}" },
  { code: "uk", name: "Ukrainian", flag: "\u{1F1FA}\u{1F1E6}" },
  { code: "pl", name: "Polish", flag: "\u{1F1F5}\u{1F1F1}" },
  { code: "ar", name: "Arabic", flag: "\u{1F1F8}\u{1F1E6}" },
];

const LEVELS = [
  { code: "A2", name: "Elementary", desc: "I know basic words and phrases" },
  { code: "B1", name: "Intermediate", desc: "I can have simple conversations" },
  { code: "B2", name: "Upper-Intermediate", desc: "I understand most content" },
  { code: "C1", name: "Advanced", desc: "I'm nearly fluent" },
];

const GOALS = [
  { xp: 50, words: "~5", label: "Casual", desc: "Learn at your own pace" },
  { xp: 100, words: "~10", label: "Regular", desc: "Build a daily habit" },
  { xp: 200, words: "~20", label: "Serious", desc: "Fast progress" },
  { xp: 300, words: "~30", label: "Intense", desc: "Maximum growth" },
];

// Map XP-style values to word counts
const XP_TO_WORDS: Record<number, number> = { 50: 5, 100: 10, 200: 20, 300: 30 };

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [targetLang, setTargetLang] = useState("ru");
  const [userLevel, setUserLevel] = useState("B1");
  const [dailyGoal, setDailyGoal] = useState(100);
  const setDailyGoalMutation = useMutation(api.gamification.setDailyGoal);

  // Restore progress on mount
  useEffect(() => {
    chrome.storage.local.get("onboardingProgress").then((data) => {
      if (data.onboardingProgress) {
        const p = data.onboardingProgress as { step?: number; targetLang?: string; userLevel?: string; dailyGoal?: number };
        if (p.step !== undefined) setStep(p.step);
        if (p.targetLang) setTargetLang(p.targetLang);
        if (p.userLevel) setUserLevel(p.userLevel);
        if (p.dailyGoal) setDailyGoal(p.dailyGoal);
      }
    });
  }, []);

  // Persist progress on each state change
  useEffect(() => {
    chrome.storage.local.set({
      onboardingProgress: { step, targetLang, userLevel, dailyGoal },
    });
  }, [step, targetLang, userLevel, dailyGoal]);

  const handleFinish = () => {
    chrome.storage.local.remove("onboardingProgress");

    // Sync daily goal to Convex
    const mappedGoal = XP_TO_WORDS[dailyGoal] ?? Math.round(dailyGoal / 10);
    chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" }).then((res) => {
      if (res?.deviceId) {
        setDailyGoalMutation({ deviceId: res.deviceId, goal: mappedGoal });
      }
    }).catch(() => {});

    onComplete({ targetLang, userLevel, dailyGoal });
  };

  return (
    <div className="w-[340px] p-4 bg-white">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all ${
              i === step ? "bg-blue-500 w-4" : i < step ? "bg-blue-300" : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      {/* Step 0: Welcome */}
      {step === 0 && (
        <div className="text-center">
          <img src="/logo.png" alt="Vocabify" className="w-16 h-16 rounded-2xl mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Welcome to Vocabify!</h1>
          <p className="text-sm text-gray-600 mb-6">
            Learn English vocabulary while browsing the web. Let's set you up in 30 seconds.
          </p>
          <button
            onClick={() => setStep(1)}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
          >
            Get Started
          </button>
        </div>
      )}

      {/* Step 1: Native language */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Your native language?</h2>
          <p className="text-sm text-gray-500 mb-4">We'll translate English words to this</p>
          <div className="grid grid-cols-3 gap-2 mb-4 max-h-[200px] overflow-y-auto">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setTargetLang(lang.code)}
                className={`p-2 rounded-lg text-center transition-all ${
                  targetLang === lang.code
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <span className="text-xl block">{lang.flag}</span>
                <span className="text-xs">{lang.name}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep(2)}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 2: English level */}
      {step === 2 && (
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Your English level?</h2>
          <p className="text-sm text-gray-500 mb-4">Helps us personalize explanations</p>
          <div className="space-y-2 mb-4">
            {LEVELS.map((level) => (
              <button
                key={level.code}
                onClick={() => setUserLevel(level.code)}
                className={`w-full p-3 rounded-xl text-left transition-all ${
                  userLevel === level.code
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{level.code} - {level.name}</span>
                  {userLevel === level.code && <span>&#10003;</span>}
                </div>
                <p className={`text-xs ${userLevel === level.code ? "text-blue-100" : "text-gray-500"}`}>
                  {level.desc}
                </p>
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep(3)}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 3: Daily goal */}
      {step === 3 && (
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Set a daily goal</h2>
          <p className="text-sm text-gray-500 mb-4">How much do you want to learn?</p>
          <div className="space-y-2 mb-4">
            {GOALS.map((goal) => (
              <button
                key={goal.xp}
                onClick={() => setDailyGoal(goal.xp)}
                className={`w-full p-3 rounded-xl text-left transition-all ${
                  dailyGoal === goal.xp
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{goal.label}</span>
                  <span className={`text-xs ${dailyGoal === goal.xp ? "text-blue-100" : "text-gray-500"}`}>
                    {goal.words} words/day
                  </span>
                </div>
                <p className={`text-xs ${dailyGoal === goal.xp ? "text-blue-100" : "text-gray-500"}`}>
                  {goal.desc}
                </p>
              </button>
            ))}
          </div>
          <button
            onClick={handleFinish}
            className="w-full py-3 bg-green-500 text-white font-medium rounded-xl hover:bg-green-600 transition-colors"
          >
            Start Learning!
          </button>
        </div>
      )}

      {/* Back + Skip links */}
      {step > 0 && (
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setStep(step - 1)}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            &larr; Back
          </button>
          <button
            onClick={handleFinish}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Skip setup
          </button>
        </div>
      )}
    </div>
  );
}
