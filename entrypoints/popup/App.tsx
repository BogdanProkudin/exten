import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useState, useCallback } from "react";
import { Onboarding } from "./Onboarding";

interface GamificationStats {
  currentStreak: number;
  longestStreak: number;
  totalXp: number;
  level: number;
  dailyXp: number;
  dailyGoalXp: number;
  dailyWordsLearned: number;
  dailyReviewsDone: number;
  xpProgress: { current: number; needed: number; progress: number };
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xp: number;
  unlocked: boolean;
  unlockedAt?: number;
}

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [quickReviewActive, setQuickReviewActive] = useState(false);
  const [gamificationStats, setGamificationStats] = useState<GamificationStats | null>(null);
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" }).then((res) => {
      if (res?.deviceId) setDeviceId(res.deviceId);
    });
    
    // Check if onboarding completed
    chrome.storage.sync.get("onboardingComplete").then((data) => {
      setShowOnboarding(!data.onboardingComplete);
      setOnboardingChecked(true);
    });
  }, []);
  
  const handleOnboardingComplete = (settings: { targetLang: string; userLevel: string; dailyGoal: number }) => {
    chrome.storage.sync.set({
      onboardingComplete: true,
      targetLang: settings.targetLang,
      userLevel: settings.userLevel,
      dailyGoalXp: settings.dailyGoal,
    });
    setTargetLang(settings.targetLang);
    setUserLevel(settings.userLevel);
    setShowOnboarding(false);
  };

  // Fetch gamification stats and check for new achievements
  useEffect(() => {
    if (!deviceId) return;
    chrome.runtime.sendMessage({ type: "GET_STATS" }).then((res) => {
      if (res?.success && res.stats) {
        setGamificationStats(res.stats);
      }
    });
    // Check for unnotified achievements
    chrome.runtime.sendMessage({ type: "GET_ACHIEVEMENTS" }).then((res) => {
      if (res?.success && res.achievements) {
        const unnotified = res.achievements.find(
          (a: Achievement) => a.unlocked && a.unlockedAt && Date.now() - a.unlockedAt < 60000
        );
        if (unnotified) {
          setNewAchievement(unnotified);
          // Auto-dismiss after 5s
          setTimeout(() => setNewAchievement(null), 5000);
        }
      }
    });
  }, [deviceId]);

  const stats = useQuery(
    api.words.stats,
    deviceId ? { deviceId } : "skip",
  );

  // Read DND state and settings
  const [dndUntil, setDndUntil] = useState<number | null>(null);
  const [reviewInterval, setReviewInterval] = useState(30);
  const [maxToastsPerDay, setMaxToastsPerDay] = useState(15);
  const [excludedDomains, setExcludedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [currentDomain, setCurrentDomain] = useState<string | null>(null);
  const [readingAssistantEnabled, setReadingAssistantEnabled] = useState(true);
  const [radarEnabled, setRadarEnabled] = useState(true);
  const [showDifficultyBadge, setShowDifficultyBadge] = useState(true);
  const [youtubeSubtitlesEnabled, setYoutubeSubtitlesEnabled] = useState(true);
  const [targetLang, setTargetLang] = useState("ru");
  const [userLevel, setUserLevel] = useState("B1");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    chrome.storage.sync.get([
      "dndUntil", "reviewIntervalMinutes", "excludedDomains", "maxToastsPerDay",
      "readingAssistantEnabled", "radarEnabled", "showDifficultyBadge", "youtubeSubtitlesEnabled",
      "targetLang", "userLevel", "theme",
    ]).then((data: Record<string, unknown>) => {
      if (data.dndUntil) setDndUntil(data.dndUntil as number);
      if (data.reviewIntervalMinutes) setReviewInterval(data.reviewIntervalMinutes as number);
      if (data.excludedDomains) setExcludedDomains(data.excludedDomains as string[]);
      if (data.maxToastsPerDay) setMaxToastsPerDay(data.maxToastsPerDay as number);
      if (data.readingAssistantEnabled !== undefined) setReadingAssistantEnabled(data.readingAssistantEnabled as boolean);
      if (data.radarEnabled !== undefined) setRadarEnabled(data.radarEnabled as boolean);
      if (data.showDifficultyBadge !== undefined) setShowDifficultyBadge(data.showDifficultyBadge as boolean);
      if (data.youtubeSubtitlesEnabled !== undefined) setYoutubeSubtitlesEnabled(data.youtubeSubtitlesEnabled as boolean);
      if (data.targetLang) setTargetLang(data.targetLang as string);
      if (data.userLevel) setUserLevel(data.userLevel as string);
      if (data.theme) setTheme(data.theme as "light" | "dark" | "system");
    });
    // Get current tab domain
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url) {
        try {
          setCurrentDomain(new URL(tab.url).hostname);
        } catch { /* ignore invalid URLs */ }
      }
    });
  }, []);

  const isDnd = dndUntil !== null && Date.now() < dndUntil;

  const setDnd = (hours: number | null) => {
    if (hours === null) {
      // Resume
      chrome.storage.sync.remove("dndUntil");
      setDndUntil(null);
    } else {
      const until = Date.now() + hours * 60 * 60 * 1000;
      chrome.storage.sync.set({ dndUntil: until });
      setDndUntil(until);
    }
  };

  const handleIntervalChange = (minutes: number) => {
    setReviewInterval(minutes);
    chrome.storage.sync.set({ reviewIntervalMinutes: minutes });
    // Update alarm
    chrome.alarms.create("vocabify-review", { periodInMinutes: minutes });
  };

  const openNewTab = (tab?: string) => {
    const url = chrome.runtime.getURL("/newtab.html");
    chrome.tabs.create({ url: tab ? `${url}#${tab}` : url });
  };

  // Determine if dark mode should be active
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  // Show onboarding for new users
  if (!onboardingChecked) {
    return (
      <div className="w-[340px] p-4 bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className={`w-[340px] p-4 ${isDark ? "bg-gray-900 text-white" : "bg-white"}`}>
      {/* Achievement Toast */}
      {newAchievement && (
        <div 
          className="mb-3 p-3 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl text-white animate-bounce-in"
          onClick={() => setNewAchievement(null)}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{newAchievement.icon}</span>
            <div>
              <p className="font-bold text-sm">🎉 Achievement Unlocked!</p>
              <p className="text-xs font-medium">{newAchievement.name}</p>
              <p className="text-xs opacity-90">+{newAchievement.xp} XP</p>
            </div>
          </div>
        </div>
      )}

      {/* Header with Streak */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <h1 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Vocabify</h1>
        </div>
        {gamificationStats && gamificationStats.currentStreak > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-orange-50 rounded-lg">
            <span className="text-lg">🔥</span>
            <span className="text-sm font-bold text-orange-600">{gamificationStats.currentStreak}</span>
          </div>
        )}
      </div>

      {/* Gamification Stats Bar */}
      {gamificationStats && (
        <div className={`mb-4 p-3 rounded-xl ${isDark ? "bg-gradient-to-r from-blue-900/50 to-purple-900/50" : "bg-gradient-to-r from-blue-50 to-purple-50"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                LVL {gamificationStats.level}
              </span>
              <span className={`text-xs ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                {gamificationStats.totalXp} XP
              </span>
            </div>
            <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {gamificationStats.xpProgress.current}/{gamificationStats.xpProgress.needed} to next
            </span>
          </div>
          {/* XP Progress Bar */}
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
              style={{ width: `${gamificationStats.xpProgress.progress}%` }}
            />
          </div>
          {/* Daily Progress */}
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="text-gray-600">
              Today: {gamificationStats.dailyXp}/{gamificationStats.dailyGoalXp} XP
            </span>
            {gamificationStats.dailyXp >= gamificationStats.dailyGoalXp && (
              <span className="text-green-600 font-medium">✓ Goal complete!</span>
            )}
          </div>
        </div>
      )}

      {!stats ? (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {([
            { label: "Total Words", value: stats.total, color: "blue" },
            { label: "Need Review", value: stats.needReview, color: "amber" },
            { label: "Learning", value: stats.learning, color: "purple" },
            { label: "Known", value: stats.known, color: "green" },
          ] as const).map((s, i) => (
            <StatCard key={s.label} label={s.label} value={s.value} color={s.color} delay={i * 50} />
          ))}
        </div>
      )}

      {quickReviewActive && deviceId ? (
        <QuickReviewInline
          deviceId={deviceId}
          onClose={() => setQuickReviewActive(false)}
        />
      ) : (
      <>
      {/* Primary CTA */}
      <button
        onClick={() => openNewTab("review")}
        className="w-full py-2.5 px-4 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors mb-2"
        style={{ borderRadius: "10px" }}
      >
        Review Words
      </button>

      {/* Secondary links */}
      <div className="flex justify-center gap-4 mb-2">
        <button
          onClick={() => openNewTab("vocabulary")}
          className="text-xs text-blue-500 hover:text-blue-600 font-medium"
        >
          Vocabulary
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => openNewTab("hard")}
          className="text-xs text-blue-500 hover:text-blue-600 font-medium"
        >
          Hard Words
        </button>
      </div>

      {/* Quick Review — outline style */}
      <button
        onClick={() => setQuickReviewActive(true)}
        className="w-full py-2 px-4 text-sm font-medium rounded-lg transition-colors mb-3"
        style={{
          border: "1px solid #e5e7eb",
          background: "#fff",
          color: "#374151",
          borderRadius: "10px",
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#f9fafb"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "#fff"; }}
      >
        Quick Review (3 words)
      </button>

      {/* DND Controls — stays top-level */}
      <div className="border-t border-gray-100 pt-3 mb-3">
        {isDnd ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-600 font-medium">
              Paused until {new Date(dndUntil!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <button
              onClick={() => setDnd(null)}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium"
            >
              Resume
            </button>
          </div>
        ) : (
          <div className="flex gap-1">
            <span className="text-xs text-gray-500 mr-1 self-center">Pause:</span>
            {[
              { label: "1h", hours: 1 },
              { label: "2h", hours: 2 },
              { label: "Tomorrow", hours: (() => {
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(9, 0, 0, 0);
                return (tomorrow.getTime() - now.getTime()) / (60 * 60 * 1000);
              })() },
            ].map(({ label, hours }) => (
              <button
                key={label}
                onClick={() => setDnd(hours)}
                className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Collapsible: Review Settings */}
      <details className="border-t border-gray-100 pt-2 mb-2">
        <summary className="text-xs font-medium text-gray-500 cursor-pointer select-none py-1">
          Review Settings
        </summary>
        <div className="mt-2 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Review every
            </label>
            <select
              value={reviewInterval}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-white"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={240}>4 hours</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Max daily reviews: {maxToastsPerDay}
            </label>
            <input
              type="range"
              min={1}
              max={50}
              value={maxToastsPerDay}
              onChange={(e) => {
                const val = Number(e.target.value);
                setMaxToastsPerDay(val);
                chrome.storage.sync.set({ maxToastsPerDay: val });
              }}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>1</span>
              <span>50</span>
            </div>
          </div>
        </div>
      </details>

      {/* Collapsible: Language */}
      <details className="border-t border-gray-100 pt-2 mb-2">
        <summary className="text-xs font-medium text-gray-500 cursor-pointer select-none py-1">
          Language
        </summary>
        <div className="mt-2 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Translate to
            </label>
            <select
              value={targetLang}
              onChange={(e) => {
                const val = e.target.value;
                setTargetLang(val);
                chrome.storage.sync.set({ targetLang: val });
              }}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-white"
            >
              <option value="ru">Russian</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="pt">Portuguese</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="ar">Arabic</option>
              <option value="hi">Hindi</option>
              <option value="uk">Ukrainian</option>
              <option value="pl">Polish</option>
              <option value="tr">Turkish</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Your English level
            </label>
            <select
              value={userLevel}
              onChange={(e) => {
                const val = e.target.value;
                setUserLevel(val);
                chrome.storage.sync.set({ userLevel: val });
              }}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-white"
            >
              <option value="A2">A2 - Elementary</option>
              <option value="B1">B1 - Intermediate</option>
              <option value="B2">B2 - Upper Intermediate</option>
              <option value="C1">C1 - Advanced</option>
            </select>
            <p className="text-[10px] text-gray-500 mt-1">
              Used for AI explanations complexity
            </p>
          </div>
        </div>
      </details>

      {/* Collapsible: Appearance */}
      <details className={`border-t ${isDark ? "border-gray-700" : "border-gray-100"} pt-2 mb-2`}>
        <summary className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"} cursor-pointer select-none py-1`}>
          Appearance
        </summary>
        <div className="mt-2 space-y-3">
          <div>
            <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"} mb-1 block`}>
              Theme
            </label>
            <div className="flex gap-1">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTheme(t);
                    chrome.storage.sync.set({ theme: t });
                  }}
                  className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition-colors ${
                    theme === t
                      ? "bg-blue-500 text-white"
                      : isDark
                        ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t === "light" ? "☀️ Light" : t === "dark" ? "🌙 Dark" : "💻 System"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      {/* Collapsible: Site & Features */}
      <details className={`border-t ${isDark ? "border-gray-700" : "border-gray-100"} pt-2 mb-2`}>
        <summary className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"} cursor-pointer select-none py-1`}>
          Site & Features
        </summary>
        <div className="mt-2">
          {/* Site Exclusion */}
          <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"} mb-2 block`}>
            Excluded Sites
          </label>
          {currentDomain && !excludedDomains.includes(currentDomain) && (
            <button
              onClick={() => {
                const updated = [...excludedDomains, currentDomain];
                setExcludedDomains(updated);
                chrome.storage.sync.set({ excludedDomains: updated });
              }}
              className="w-full text-xs py-1.5 mb-2 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Disable on {currentDomain}
            </button>
          )}
          {excludedDomains.length > 0 ? (
            <div className="space-y-1 mb-2">
              {excludedDomains.map((domain) => (
                <div key={domain} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate">{domain}</span>
                  <button
                    onClick={() => {
                      const updated = excludedDomains.filter((d) => d !== domain);
                      setExcludedDomains(updated);
                      chrome.storage.sync.set({ excludedDomains: updated });
                    }}
                    className="text-gray-400 hover:text-red-500 ml-2 shrink-0"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 mb-2">No excluded sites</p>
          )}
          <div className="flex gap-1 mb-3">
            <input
              type="text"
              placeholder="example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newDomain.trim()) {
                  const domain = newDomain.trim().toLowerCase();
                  if (!excludedDomains.includes(domain)) {
                    const updated = [...excludedDomains, domain];
                    setExcludedDomains(updated);
                    chrome.storage.sync.set({ excludedDomains: updated });
                  }
                  setNewDomain("");
                }
              }}
              className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded bg-white"
            />
            <button
              onClick={() => {
                const domain = newDomain.trim().toLowerCase();
                if (domain && !excludedDomains.includes(domain)) {
                  const updated = [...excludedDomains, domain];
                  setExcludedDomains(updated);
                  chrome.storage.sync.set({ excludedDomains: updated });
                }
                setNewDomain("");
              }}
              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Add
            </button>
          </div>

          {/* Reading Companion */}
          <label className="text-xs font-medium text-gray-500 mb-2 block">
            Reading Companion
          </label>
          <SettingToggle
            label="Reading Assistant"
            description="Analyze page difficulty and show unknown words"
            checked={readingAssistantEnabled}
            onChange={(v) => {
              setReadingAssistantEnabled(v);
              chrome.storage.sync.set({ readingAssistantEnabled: v });
            }}
          />
          <SettingToggle
            label="Vocabulary Radar"
            description="Track frequently seen unknown words across pages"
            checked={radarEnabled}
            onChange={(v) => {
              setRadarEnabled(v);
              chrome.storage.sync.set({ radarEnabled: v });
            }}
          />
          <SettingToggle
            label="Difficulty Badge"
            description="Show CEFR level badge on pages"
            checked={showDifficultyBadge}
            onChange={(v) => {
              setShowDifficultyBadge(v);
              chrome.storage.sync.set({ showDifficultyBadge: v });
            }}
          />

          {/* YouTube Integration */}
          <label className="text-xs font-medium text-gray-500 mb-2 block mt-3">
            Video Learning
          </label>
          <SettingToggle
            label="YouTube Subtitles"
            description="Click words in YouTube subtitles to translate"
            checked={youtubeSubtitlesEnabled}
            onChange={(v) => {
              setYoutubeSubtitlesEnabled(v);
              chrome.storage.sync.set({ youtubeSubtitlesEnabled: v });
            }}
          />
        </div>
      </details>

      <p className="text-xs text-gray-500 text-center mt-3">
        Select any English word on a page to translate
      </p>
      </>
      )}
    </div>
  );
}

// --- Quick Review Inline ---

function QuickReviewInline({
  deviceId,
  onClose,
}: {
  deviceId: string;
  onClose: () => void;
}) {
  const reviewWordsLive = useQuery(api.words.getReviewWords, { deviceId, limit: 3 });

  type ReviewWord = NonNullable<typeof reviewWordsLive>[number];

  const [queue, setQueue] = useState<ReviewWord[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(false);

  // Snapshot on first load
  useEffect(() => {
    if (reviewWordsLive && !queue) {
      setQueue([...reviewWordsLive]);
    }
  }, [reviewWordsLive, queue]);

  const handleAnswer = useCallback(
    async (remembered: boolean) => {
      if (!queue || answered) return;
      const current = queue[currentIndex];
      if (!current) return;
      setAnswered(true);

      try {
        await chrome.runtime.sendMessage({
          type: "REVIEW_RESULT",
          wordId: current._id,
          remembered,
        });
      } catch (e) {
        console.error("[Vocabify] Quick review failed:", e);
      }

      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setRevealed(false);
        setAnswered(false);
      }, 300);
    },
    [queue, currentIndex, answered],
  );

  if (!queue) {
    return (
      <div className="py-6 text-center">
        <div className="w-4 h-4 rounded-full animate-spin mx-auto mb-2" style={{ border: "2px solid #e5e7eb", borderTopColor: "#3b82f6" }} />
        <p className="text-xs text-gray-500">Loading…</p>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-gray-600 mb-3">No words to review!</p>
        <button onClick={onClose} className="text-sm text-blue-500 hover:text-blue-600 font-medium">
          Back
        </button>
      </div>
    );
  }

  const current = queue[currentIndex];

  if (!current) {
    return (
      <div className="py-6 text-center">
        <div className="text-2xl mb-2">&#10003;</div>
        <p className="text-sm font-medium text-gray-800 mb-1">Session complete!</p>
        <p className="text-xs text-gray-500 mb-3">Reviewed {queue.length} word{queue.length !== 1 ? "s" : ""}.</p>
        <button onClick={onClose} className="text-sm text-blue-500 hover:text-blue-600 font-medium">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="py-2">
      <p className="text-xs text-gray-500 text-center mb-2">
        {currentIndex + 1} / {queue.length}
      </p>
      <p className="text-lg font-bold text-gray-900 text-center mb-3">{current.word}</p>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors mb-2"
        >
          Reveal Translation
        </button>
      ) : (
        <>
          <div className="text-center py-2 px-3 mb-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-800 font-medium">{current.translation}</p>
          </div>
          {!answered && (
            <div className="flex gap-2">
              <button
                onClick={() => handleAnswer(false)}
                className="flex-1 py-2 text-sm font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                Forgot
              </button>
              <button
                onClick={() => handleAnswer(true)}
                className="flex-1 py-2 text-sm font-medium rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
              >
                Remembered
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  delay = 0,
}: {
  label: string;
  value: number;
  color: string;
  delay?: number;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-purple-700",
    green: "bg-green-50 text-green-700",
  };

  return (
    <div
      className={`rounded-lg p-3 ${colors[color] || colors.blue}`}
      style={{
        animation: `fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) ${delay}ms both`,
      }}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex-1 min-w-0 mr-2">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        <div className="text-[10px] text-gray-500 leading-tight">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="shrink-0 relative transition-colors duration-200"
        style={{
          width: "32px",
          height: "16px",
          borderRadius: "8px",
          background: checked ? "#3b82f6" : "#d1d5db",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "16px" : "2px",
            width: "12px",
            height: "12px",
            borderRadius: "6px",
            background: "#fff",
            transition: "left 200ms ease",
            boxShadow: "0 1px 2px rgba(0,0,0,.15)",
          }}
        />
      </button>
    </div>
  );
}
