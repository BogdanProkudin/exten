import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  type TtsSettings,
  type TtsEngine,
  type OpenAIVoice,
  loadTtsSettings,
  saveTtsSettings,
  getAvailableVoices,
  playPreview,
} from "../../src/lib/tts";

interface SettingsTabProps {
  deviceId: string;
}

export function SettingsTab({ deviceId }: SettingsTabProps) {
  // --- Review settings ---
  const [reviewInterval, setReviewInterval] = useState(30);
  const [maxToastsPerDay, setMaxToastsPerDay] = useState(15);
  const [dailyGoalWords, setDailyGoalWords] = useState(10);
  const [showReviewTimer, setShowReviewTimer] = useState(true);
  const [reviewMode, setReviewMode] = useState<"smart" | "classic">("smart");

  // --- Language ---
  const [targetLang, setTargetLang] = useState("ru");
  const [userLevel, setUserLevel] = useState("B1");

  // --- Appearance ---
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  // --- Voice ---
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>({ engine: "google", voiceURI: null, rate: 0.9, pitch: 1.0, openaiVoice: "nova" });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);

  // --- Features ---
  const [readingAssistantEnabled, setReadingAssistantEnabled] = useState(true);
  const [radarEnabled, setRadarEnabled] = useState(true);
  const [youtubeSubtitlesEnabled, setYoutubeSubtitlesEnabled] = useState(true);

  // --- Excluded sites ---
  const [excludedDomains, setExcludedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");

  const setDailyGoalMutation = useMutation(api.gamification.setDailyGoal);

  useEffect(() => {
    chrome.storage.sync.get([
      "reviewIntervalMinutes", "maxToastsPerDay", "dailyGoalXp",
      "showReviewTimer", "reviewMode",
      "targetLang", "userLevel", "theme",
      "readingAssistantEnabled", "radarEnabled", "youtubeSubtitlesEnabled",
      "excludedDomains",
    ]).then((data: Record<string, unknown>) => {
      if (data.reviewIntervalMinutes) setReviewInterval(data.reviewIntervalMinutes as number);
      if (data.maxToastsPerDay) setMaxToastsPerDay(data.maxToastsPerDay as number);
      if (data.dailyGoalXp) setDailyGoalWords(Math.round((data.dailyGoalXp as number) / 10));
      if (data.showReviewTimer !== undefined) setShowReviewTimer(data.showReviewTimer as boolean);
      if (data.reviewMode) setReviewMode(data.reviewMode as "smart" | "classic");
      if (data.targetLang) setTargetLang(data.targetLang as string);
      if (data.userLevel) setUserLevel(data.userLevel as string);
      if (data.theme) setTheme(data.theme as "light" | "dark" | "system");
      if (data.readingAssistantEnabled !== undefined) setReadingAssistantEnabled(data.readingAssistantEnabled as boolean);
      if (data.radarEnabled !== undefined) setRadarEnabled(data.radarEnabled as boolean);
      if (data.youtubeSubtitlesEnabled !== undefined) setYoutubeSubtitlesEnabled(data.youtubeSubtitlesEnabled as boolean);
      if (data.excludedDomains) setExcludedDomains(data.excludedDomains as string[]);
    });
    loadTtsSettings().then(setTtsSettings);
    getAvailableVoices().then(setVoices);
    chrome.storage.local.get("openaiApiKey").then((d) => {
      if (d.openaiApiKey) setOpenaiApiKey(d.openaiApiKey as string);
    });
  }, []);

  const handleIntervalChange = (val: number) => {
    setReviewInterval(val);
    chrome.storage.sync.set({ reviewIntervalMinutes: val });
    chrome.runtime.sendMessage({ type: "UPDATE_ALARM", intervalMinutes: val });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Settings</h2>
        <p className="text-sm text-gray-400">Customize your learning experience</p>
      </div>

      {/* Review Settings */}
      <Section title="Review" icon="📖">
        <Field label="Review every">
          <select
            value={reviewInterval}
            onChange={(e) => handleIntervalChange(Number(e.target.value))}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={240}>4 hours</option>
          </select>
        </Field>

        <SliderField label="Max daily reviews" value={maxToastsPerDay} min={1} max={50}
          onChange={(val) => { setMaxToastsPerDay(val); chrome.storage.sync.set({ maxToastsPerDay: val }); }}
        />

        <SliderField label="Daily goal" value={dailyGoalWords} min={1} max={30} suffix=" words"
          onChange={(val) => {
            setDailyGoalWords(val);
            chrome.storage.sync.set({ dailyGoalXp: val * 10 });
            setDailyGoalMutation({ deviceId, goal: val });
          }}
        />

        <Toggle label="Review Timer" description="Show countdown to next review on pages"
          checked={showReviewTimer}
          onChange={(v) => { setShowReviewTimer(v); chrome.storage.sync.set({ showReviewTimer: v }); }}
        />

        <Toggle label="Smart Reviews" description="Test-based challenges instead of self-reporting"
          checked={reviewMode === "smart"}
          onChange={(v) => {
            const mode = v ? "smart" : "classic";
            setReviewMode(mode);
            chrome.storage.sync.set({ reviewMode: mode });
          }}
        />
      </Section>

      {/* Language */}
      <Section title="Language" icon="🌍">
        <Field label="Translate to">
          <select
            value={targetLang}
            onChange={(e) => { setTargetLang(e.target.value); chrome.storage.sync.set({ targetLang: e.target.value }); }}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
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
        </Field>
        <Field label="Your English level">
          <select
            value={userLevel}
            onChange={(e) => { setUserLevel(e.target.value); chrome.storage.sync.set({ userLevel: e.target.value }); }}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
          >
            <option value="A2">A2 - Elementary</option>
            <option value="B1">B1 - Intermediate</option>
            <option value="B2">B2 - Upper Intermediate</option>
            <option value="C1">C1 - Advanced</option>
          </select>
        </Field>
      </Section>

      {/* Voice & Pronunciation */}
      <Section title="Voice & Pronunciation" icon="🔊">
        <Field label="Engine">
          <div className="flex gap-2">
            {([
              { id: "google" as TtsEngine, label: "Google", desc: "Natural, free" },
              { id: "openai" as TtsEngine, label: "OpenAI", desc: "Premium quality" },
              { id: "browser" as TtsEngine, label: "Browser", desc: "Offline, system" },
            ]).map((eng) => (
              <button
                key={eng.id}
                onClick={() => {
                  const updated = { ...ttsSettings, engine: eng.id };
                  setTtsSettings(updated);
                  saveTtsSettings(updated);
                  setPreviewError(null);
                }}
                className={`flex-1 py-2.5 px-2 text-center rounded-lg transition-all ${
                  ttsSettings.engine === eng.id
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <span className="text-sm font-medium block">{eng.label}</span>
                <span className={`text-[10px] block mt-0.5 ${ttsSettings.engine === eng.id ? "text-indigo-100" : "text-gray-400"}`}>{eng.desc}</span>
              </button>
            ))}
          </div>
        </Field>

        {/* OpenAI voice selector */}
        {ttsSettings.engine === "openai" && (
          <>
            <Field label="Voice">
              <div className="grid grid-cols-3 gap-1.5">
                {(["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as OpenAIVoice[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      const updated = { ...ttsSettings, openaiVoice: v };
                      setTtsSettings(updated);
                      saveTtsSettings(updated);
                    }}
                    className={`py-1.5 px-2 text-xs font-medium rounded-lg transition-all capitalize ${
                      ttsSettings.openaiVoice === v
                        ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="API Key">
              <input
                type="password"
                value={openaiApiKey}
                onChange={(e) => {
                  setOpenaiApiKey(e.target.value);
                  chrome.storage.local.set({ openaiApiKey: e.target.value });
                }}
                placeholder="sk-..."
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
              />
              <p className="text-[10px] text-gray-400 mt-1">Used for TTS and AI features. Stored locally.</p>
            </Field>
          </>
        )}

        {/* Browser voice selector */}
        {ttsSettings.engine === "browser" && (
          <>
            <Field label="Voice">
              <select
                value={ttsSettings.voiceURI ?? ""}
                onChange={(e) => {
                  const updated = { ...ttsSettings, voiceURI: e.target.value || null };
                  setTtsSettings(updated);
                  saveTtsSettings(updated);
                }}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
              >
                <option value="">System default</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </Field>
            <SliderField label="Pitch" value={ttsSettings.pitch} min={0.5} max={1.5} step={0.1}
              format={(v) => `${v <= 0.7 ? "Low" : v >= 1.3 ? "High" : "Normal"} (${v.toFixed(1)})`}
              onChange={(val) => { const u = { ...ttsSettings, pitch: val }; setTtsSettings(u); saveTtsSettings(u); }}
            />
          </>
        )}

        <SliderField label="Speed" value={ttsSettings.rate} min={0.5} max={1.5} step={0.1}
          format={(v) => `${v <= 0.7 ? "Slow" : v >= 1.2 ? "Fast" : "Normal"} (${v.toFixed(1)}x)`}
          onChange={(val) => { const u = { ...ttsSettings, rate: val }; setTtsSettings(u); saveTtsSettings(u); }}
        />

        {previewError && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{previewError}</p>
        )}

        <button
          onClick={() => {
            setPreviewError(null);
            playPreview("Hello, vocabulary!", ttsSettings)
              .catch((e) => setPreviewError(e.message || "Preview failed"));
          }}
          className="mt-1 flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-sm font-medium transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Preview voice
        </button>
      </Section>

      {/* Appearance */}
      <Section title="Appearance" icon="🎨">
        <Field label="Theme">
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTheme(t); chrome.storage.sync.set({ theme: t }); }}
                className={`flex-1 py-2 px-3 text-sm rounded-lg transition-all font-medium ${
                  theme === t
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t === "light" ? "☀️ Light" : t === "dark" ? "🌙 Dark" : "💻 System"}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* Features */}
      <Section title="Features" icon="⚡">
        <Toggle label="Reading Assistant" description="Analyze page difficulty and show unknown words"
          checked={readingAssistantEnabled}
          onChange={(v) => { setReadingAssistantEnabled(v); chrome.storage.sync.set({ readingAssistantEnabled: v }); }}
        />
        <Toggle label="Vocabulary Radar" description="Track frequently seen unknown words across pages"
          checked={radarEnabled}
          onChange={(v) => { setRadarEnabled(v); chrome.storage.sync.set({ radarEnabled: v }); }}
        />
        <Toggle label="YouTube Subtitles" description="Click words in YouTube subtitles to translate"
          checked={youtubeSubtitlesEnabled}
          onChange={(v) => { setYoutubeSubtitlesEnabled(v); chrome.storage.sync.set({ youtubeSubtitlesEnabled: v }); }}
        />
      </Section>

      {/* Excluded Sites */}
      <Section title="Excluded Sites" icon="🚫">
        <div className="space-y-2">
          {excludedDomains.length > 0 ? (
            <div className="space-y-1.5">
              {excludedDomains.map((domain) => (
                <div key={domain} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50 group">
                  <span className="text-sm text-gray-600">{domain}</span>
                  <button
                    onClick={() => {
                      const updated = excludedDomains.filter((d) => d !== domain);
                      setExcludedDomains(updated);
                      chrome.storage.sync.set({ excludedDomains: updated });
                    }}
                    className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No excluded sites</p>
          )}
          <div className="flex gap-2 mt-2">
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
              className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
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
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </Section>

      {/* Danger zone */}
      <div className="pt-2 border-t border-gray-100">
        <button
          onClick={() => chrome.storage.local.remove("vocabifyTips")}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Reset learning tips
        </button>
      </div>
    </div>
  );
}

/* ---------- Reusable sub-components ---------- */

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <span>{icon}</span> {title}
        </h3>
      </div>
      <div className="px-5 py-4 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function SliderField({ label, value, min, max, step = 1, suffix = "", format, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string;
  format?: (v: number) => string; onChange: (v: number) => void;
}) {
  const display = format ? format(value) : `${value}${suffix}`;
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1.5 flex justify-between">
        <span>{label}</span>
        <span className="font-normal text-gray-400">{display}</span>
      </label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500 bg-gray-200"
      />
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group py-1">
      <div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="relative shrink-0 ml-4">
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className="w-9 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-500 transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
      </div>
    </label>
  );
}
