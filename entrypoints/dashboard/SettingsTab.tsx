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
    }).catch(() => {});
    loadTtsSettings().then(setTtsSettings).catch(() => {});
    getAvailableVoices().then(setVoices).catch(() => {});
    chrome.storage.local.get("openaiApiKey").then((d) => {
      if (d.openaiApiKey) setOpenaiApiKey(d.openaiApiKey as string);
    }).catch(() => {});
  }, []);

  const handleIntervalChange = (val: number) => {
    setReviewInterval(val);
    chrome.storage.sync.set({ reviewIntervalMinutes: val });
    chrome.runtime.sendMessage({ type: "UPDATE_ALARM", intervalMinutes: val }).catch(() => {});
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="stats-enter" style={{ animationDelay: "0ms" }}>
        <h2 className="text-lg font-bold text-gray-900 mb-0.5">Settings</h2>
        <p className="text-sm text-gray-400">Customize your learning experience</p>
      </div>

      {/* Review Settings */}
      <Section
        title="Review"
        icon={<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />}
        iconColor="#6366f1"
        delay="40ms"
      >
        <Field label="Review every">
          <select
            value={reviewInterval}
            onChange={(e) => handleIntervalChange(Number(e.target.value))}
            className="settings-select"
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
      <Section
        title="Language"
        icon={<path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />}
        iconColor="#10b981"
        delay="80ms"
      >
        <Field label="Translate to">
          <select
            value={targetLang}
            onChange={(e) => { setTargetLang(e.target.value); chrome.storage.sync.set({ targetLang: e.target.value }); }}
            className="settings-select"
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
            className="settings-select"
          >
            <option value="A2">A2 - Elementary</option>
            <option value="B1">B1 - Intermediate</option>
            <option value="B2">B2 - Upper Intermediate</option>
            <option value="C1">C1 - Advanced</option>
          </select>
        </Field>
      </Section>

      {/* Voice & Pronunciation */}
      <Section
        title="Voice & Pronunciation"
        icon={<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>}
        iconColor="#8b5cf6"
        delay="120ms"
      >
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
                className={`settings-option-btn flex-1 ${ttsSettings.engine === eng.id ? "active" : ""}`}
              >
                <span className="text-sm font-semibold block">{eng.label}</span>
                <span className={`text-[10px] block mt-0.5 ${ttsSettings.engine === eng.id ? "text-indigo-200" : "text-gray-400"}`}>{eng.desc}</span>
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
                    className={`settings-chip ${ttsSettings.openaiVoice === v ? "active" : ""}`}
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
                className="settings-input"
              />
              <p className="text-[10px] text-gray-400 mt-1.5">Used for TTS and AI features. Stored locally only.</p>
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
                className="settings-select"
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
          <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 px-3 py-2 rounded-xl border border-red-100">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            {previewError}
          </div>
        )}

        <button
          onClick={() => {
            setPreviewError(null);
            playPreview("Hello, vocabulary!", ttsSettings)
              .catch((e) => setPreviewError(e.message || "Preview failed"));
          }}
          className="mt-1 settings-preview-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Preview voice
        </button>
      </Section>

      {/* Appearance */}
      <Section
        title="Appearance"
        icon={<><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></>}
        iconColor="#f59e0b"
        delay="160ms"
      >
        <Field label="Theme">
          <div className="flex gap-2">
            {([
              { id: "light" as const, label: "Light", icon: <><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></> },
              { id: "dark" as const, label: "Dark", icon: <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/> },
              { id: "system" as const, label: "System", icon: <><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><path d="M8 21h8M12 17v4"/></> },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id); chrome.storage.sync.set({ theme: t.id }); }}
                className={`settings-option-btn flex-1 ${theme === t.id ? "active" : ""}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-1">
                  {t.icon}
                </svg>
                <span className="text-xs font-semibold block">{t.label}</span>
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* Features */}
      <Section
        title="Features"
        icon={<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>}
        iconColor="#f97316"
        delay="200ms"
      >
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
      <Section
        title="Excluded Sites"
        icon={<><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></>}
        iconColor="#ef4444"
        delay="240ms"
      >
        <div className="space-y-2">
          {excludedDomains.length > 0 ? (
            <div className="space-y-1.5">
              {excludedDomains.map((domain) => (
                <div key={domain} className="settings-domain-row group">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                      </svg>
                    </div>
                    <span className="text-sm text-gray-600 font-medium">{domain}</span>
                  </div>
                  <button
                    onClick={() => {
                      const updated = excludedDomains.filter((d) => d !== domain);
                      setExcludedDomains(updated);
                      chrome.storage.sync.set({ excludedDomains: updated });
                    }}
                    className="text-gray-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 cursor-pointer hover:scale-110"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-2">No excluded sites</p>
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
              className="settings-input flex-1"
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
              className="settings-add-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add
            </button>
          </div>
        </div>
      </Section>

      {/* Danger zone */}
      <div className="pt-3 border-t border-gray-100/60 stats-enter" style={{ animationDelay: "280ms" }}>
        <button
          onClick={() => chrome.storage.local.remove("vocabifyTips")}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
          Reset learning tips
        </button>
      </div>
    </div>
  );
}

/* ---------- Reusable sub-components ---------- */

function Section({ title, icon, iconColor, children, delay = "0ms" }: {
  title: string; icon: React.ReactNode; iconColor: string; children: React.ReactNode; delay?: string;
}) {
  return (
    <div className="stats-section stats-enter overflow-hidden" style={{ animationDelay: delay }}>
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-100/60">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: iconColor + "10" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {icon}
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function SliderField({ label, value, min, max, step = 1, suffix = "", format, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string;
  format?: (v: number) => string; onChange: (v: number) => void;
}) {
  const display = format ? format(value) : `${value}${suffix}`;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 flex justify-between">
        <span>{label}</span>
        <span className="font-semibold text-gray-600 normal-case tracking-normal tabular-nums">{display}</span>
      </label>
      <div className="relative">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="settings-slider"
          style={{ "--slider-pct": `${pct}%` } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group py-1.5 px-1 -mx-1 rounded-xl hover:bg-gray-50/50 transition-colors">
      <div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="relative shrink-0 ml-4">
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className="w-10 h-[22px] bg-gray-200 rounded-full peer-checked:bg-indigo-500 transition-all duration-200 peer-checked:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]" />
        <div className="absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 peer-checked:translate-x-[18px]" />
      </div>
    </label>
  );
}
