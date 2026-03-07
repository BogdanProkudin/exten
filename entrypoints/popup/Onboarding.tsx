import { useState } from "react";

interface OnboardingProps {
  onComplete: (settings: { targetLang: string; userLevel: string; dailyGoal: number }) => void;
}

const LANGUAGES = [
  { code: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "uk", name: "Ukrainian", flag: "🇺🇦" },
  { code: "pl", name: "Polish", flag: "🇵🇱" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
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

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [targetLang, setTargetLang] = useState("ru");
  const [userLevel, setUserLevel] = useState("B1");
  const [dailyGoal, setDailyGoal] = useState(100);

  const handleFinish = () => {
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
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">V</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Welcome to Vocabify!</h1>
          <p className="text-sm text-gray-600 mb-6">
            Learn English vocabulary while browsing the web. Let's set you up in 30 seconds.
          </p>
          <button
            onClick={() => setStep(1)}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
          >
            Get Started →
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
            Continue →
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
                  {userLevel === level.code && <span>✓</span>}
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
            Continue →
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
            🎉 Start Learning!
          </button>
        </div>
      )}

      {/* Skip link */}
      {step > 0 && (
        <button
          onClick={handleFinish}
          className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600"
        >
          Skip setup
        </button>
      )}
    </div>
  );
}
