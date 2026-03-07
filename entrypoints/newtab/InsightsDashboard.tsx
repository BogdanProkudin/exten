import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export interface InsightsDashboardProps {
  deviceId: string;
  onClose?: () => void;
}

// --- Helpers ---

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en", { month: "short" });
}

function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay(); // 0=Sun, 6=Sat
}

function getCefrLevel(knownCount: number): { level: string; progress: number; min: number; max: number } {
  if (knownCount < 500) return { level: "A1", progress: (knownCount / 500) * 100, min: 0, max: 500 };
  if (knownCount < 1000) return { level: "A2", progress: ((knownCount - 500) / 500) * 100, min: 500, max: 1000 };
  if (knownCount < 2000) return { level: "B1", progress: ((knownCount - 1000) / 1000) * 100, min: 1000, max: 2000 };
  if (knownCount < 4000) return { level: "B2", progress: ((knownCount - 2000) / 2000) * 100, min: 2000, max: 4000 };
  if (knownCount < 8000) return { level: "C1", progress: ((knownCount - 4000) / 4000) * 100, min: 4000, max: 8000 };
  return { level: "C2", progress: 100, min: 8000, max: 8000 };
}

function heatmapColor(count: number): string {
  if (count === 0) return "#e5e7eb"; // gray-200
  if (count <= 2) return "#86efac"; // green-300
  if (count <= 4) return "#22c55e"; // green-500
  return "#15803d"; // green-700
}

function streakColor(active: boolean): string {
  return active ? "#3b82f6" : "#e5e7eb"; // blue-500 or gray-200
}

// --- Donut Chart SVG ---
function DonutChart({ data, colors, total }: { data: number[]; colors: string[]; total: number }) {
  const radius = 60;
  const strokeWidth = 20;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg viewBox="0 0 160 160" className="w-40 h-40">
      {data.map((value, i) => {
        const pct = total > 0 ? value / total : 0;
        const dashLength = pct * circumference;
        const dashOffset = -offset;
        offset += dashLength;
        if (value === 0) return null;
        return (
          <circle
            key={i}
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={colors[i]}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashLength} ${circumference - dashLength}`}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 80 80)"
            className="transition-all duration-500"
          />
        );
      })}
      {total === 0 && (
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      )}
      <text x="80" y="76" textAnchor="middle" className="text-2xl font-bold" fill="#111827" fontSize="24">
        {total}
      </text>
      <text x="80" y="96" textAnchor="middle" fill="#6b7280" fontSize="12">
        words
      </text>
    </svg>
  );
}

// --- Line Chart SVG ---
function LineChart({ data, width = 600, height = 200 }: { data: { date: string; accuracy: number }[]; width?: number; height?: number }) {
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Only include days with actual reviews
  const pointsWithData = data.filter((d) => d.accuracy > 0 || data.some((dd) => dd.accuracy > 0));

  if (pointsWithData.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        No review data yet
      </div>
    );
  }

  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.accuracy / 100) * chartH,
    ...d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Y-axis labels */}
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <text
            x={padding.left - 8}
            y={padding.top + chartH - (v / 100) * chartH + 4}
            textAnchor="end"
            fill="#9ca3af"
            fontSize="10"
          >
            {v}%
          </text>
          <line
            x1={padding.left}
            y1={padding.top + chartH - (v / 100) * chartH}
            x2={width - padding.right}
            y2={padding.top + chartH - (v / 100) * chartH}
            stroke="#f3f4f6"
            strokeWidth="1"
          />
        </g>
      ))}

      {/* Filled area */}
      <path d={areaD} fill="url(#accuracyGradient)" opacity="0.3" />
      <defs>
        <linearGradient id="accuracyGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Line */}
      <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {points.map((p, i) =>
        p.accuracy > 0 ? (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3b82f6" stroke="white" strokeWidth="1.5">
            <title>{`${formatDate(p.date)}: ${p.accuracy}%`}</title>
          </circle>
        ) : null
      )}

      {/* X-axis labels (show every 5th) */}
      {points.map((p, i) =>
        i % 5 === 0 ? (
          <text key={i} x={p.x} y={height - 5} textAnchor="middle" fill="#9ca3af" fontSize="9">
            {formatDate(p.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}

// --- Main Component ---
export function InsightsDashboard({ deviceId, onClose }: InsightsDashboardProps) {
  const [hoveredCell, setHoveredCell] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  const heatmapData = useQuery(api.analytics.getActivityHeatmap, { deviceId, days: 90 });
  const accuracyData = useQuery(api.analytics.getAccuracyTrend, { deviceId, days: 30 });
  const strengthDist = useQuery(api.analytics.getWordStrengthDistribution, { deviceId });
  const strongestWords = useQuery(api.analytics.getTopWords, { deviceId, type: "strongest", limit: 10 });
  const weakestWords = useQuery(api.analytics.getTopWords, { deviceId, type: "weakest", limit: 10 });
  const streakHistory = useQuery(api.analytics.getStreakHistory, { deviceId, days: 90 });
  const insights = useQuery(api.analytics.getInsights, { deviceId });

  const isLoading =
    heatmapData === undefined ||
    accuracyData === undefined ||
    strengthDist === undefined ||
    strongestWords === undefined ||
    weakestWords === undefined ||
    streakHistory === undefined;

  // Compute words per week from heatmap data
  const wordsPerWeek = useMemo(() => {
    if (!heatmapData) return [];
    const weeks: { label: string; count: number }[] = [];
    // Take last 56 days (8 weeks)
    const last56 = heatmapData.slice(-56);
    for (let w = 0; w < 8; w++) {
      const weekSlice = last56.slice(w * 7, (w + 1) * 7);
      if (weekSlice.length === 0) continue;
      const count = weekSlice.reduce((s, d) => s + d.count, 0);
      const startLabel = formatDate(weekSlice[0].date);
      weeks.push({ label: startLabel, count });
    }
    return weeks;
  }, [heatmapData]);

  // Organize heatmap into weeks (columns) x days (rows)
  const heatmapGrid = useMemo(() => {
    if (!heatmapData) return { weeks: [] as { date: string; count: number }[][], months: [] as { label: string; col: number }[] };

    const weeks: { date: string; count: number }[][] = [];
    let currentWeek: { date: string; count: number }[] = [];

    // Pad first week with empty cells
    if (heatmapData.length > 0) {
      const firstDow = getDayOfWeek(heatmapData[0].date);
      for (let i = 0; i < firstDow; i++) {
        currentWeek.push({ date: "", count: -1 });
      }
    }

    for (const day of heatmapData) {
      currentWeek.push(day);
      if (getDayOfWeek(day.date) === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    // Month labels
    const months: { label: string; col: number }[] = [];
    let lastMonth = "";
    for (let w = 0; w < weeks.length; w++) {
      for (const day of weeks[w]) {
        if (day.date) {
          const m = getMonthLabel(day.date);
          if (m !== lastMonth) {
            months.push({ label: m, col: w });
            lastMonth = m;
          }
          break;
        }
      }
    }

    return { weeks, months };
  }, [heatmapData]);

  // Current streak from streak history
  const currentStreak = useMemo(() => {
    if (!streakHistory) return 0;
    let streak = 0;
    for (let i = streakHistory.length - 1; i >= 0; i--) {
      if (streakHistory[i].active) streak++;
      else break;
    }
    return streak;
  }, [streakHistory]);

  // CEFR estimate
  const cefrInfo = useMemo(() => {
    if (!insights) return null;
    return getCefrLevel(insights.totalWords);
  }, [insights]);

  // Total words for donut
  const totalWords = strengthDist ? strengthDist.weak + strengthDist.growing + strengthDist.strong + strengthDist.mastered : 0;

  const maxBarCount = Math.max(...wordsPerWeek.map((w) => w.count), 1);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
              {/* CEFR Progress Estimate */}
              {cefrInfo && (
                <section className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 p-5">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">CEFR Progress Estimate</h2>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-indigo-600">{cefrInfo.level}</p>
                      <p className="text-xs text-gray-500 mt-1">Current Level</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{cefrInfo.min} words</span>
                        <span>{cefrInfo.max === cefrInfo.min ? "8000+" : cefrInfo.max} words</span>
                      </div>
                      <div className="h-3 bg-white rounded-full overflow-hidden border border-indigo-200">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-400 to-blue-500 rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(cefrInfo.progress, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {insights?.totalWords ?? 0} words learned ({Math.round(cefrInfo.progress)}% to next level)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-4">
                    {["A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
                      <div
                        key={lvl}
                        className={`flex-1 text-center py-1 rounded text-xs font-medium transition-all ${
                          lvl === cefrInfo.level
                            ? "bg-indigo-600 text-white"
                            : "bg-white text-gray-400 border border-gray-200"
                        }`}
                      >
                        {lvl}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Activity Heatmap */}
              <section className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Activity Heatmap</h2>
                <p className="text-xs text-gray-500 mb-3">Last 90 days</p>
                <div className="relative overflow-x-auto">
                  {/* Month labels */}
                  <div className="flex ml-8 mb-1">
                    {heatmapGrid.months.map((m, i) => (
                      <span
                        key={i}
                        className="text-[10px] text-gray-400 absolute"
                        style={{ left: `${32 + m.col * 14}px` }}
                      >
                        {m.label}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-[2px] mt-5 relative">
                    {/* Day labels */}
                    <div className="flex flex-col gap-[2px] mr-1">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <div key={i} className="w-4 h-[12px] text-[9px] text-gray-400 flex items-center justify-end pr-0.5">
                          {i % 2 === 1 ? d : ""}
                        </div>
                      ))}
                    </div>
                    {heatmapGrid.weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-[2px]">
                        {week.map((day, di) => (
                          <div
                            key={di}
                            className="w-[12px] h-[12px] rounded-sm transition-all cursor-default"
                            style={{ backgroundColor: day.count < 0 ? "transparent" : heatmapColor(day.count) }}
                            onMouseEnter={(e) => {
                              if (day.date) {
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                setHoveredCell({ date: day.date, count: day.count, x: rect.left, y: rect.top - 40 });
                              }
                            }}
                            onMouseLeave={() => setHoveredCell(null)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  {/* Tooltip */}
                  {hoveredCell && (
                    <div
                      className="fixed z-50 px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg pointer-events-none"
                      style={{ left: hoveredCell.x, top: hoveredCell.y }}
                    >
                      {formatDate(hoveredCell.date)}: {hoveredCell.count} activities
                    </div>
                  )}
                  {/* Legend */}
                  <div className="flex items-center gap-1 mt-3 text-[10px] text-gray-400">
                    <span>Less</span>
                    {[0, 1, 3, 5].map((v) => (
                      <div key={v} className="w-[12px] h-[12px] rounded-sm" style={{ backgroundColor: heatmapColor(v) }} />
                    ))}
                    <span>More</span>
                  </div>
                </div>
              </section>

              {/* Words Per Week - Bar Chart */}
              <section className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Words Per Week</h2>
                {wordsPerWeek.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
                ) : (
                  <div className="flex items-end gap-3 h-40">
                    {wordsPerWeek.map((week, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <span className="text-xs font-medium text-gray-700 mb-1">{week.count}</span>
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-blue-500 to-blue-400 transition-all duration-500"
                          style={{ height: `${Math.max(4, (week.count / maxBarCount) * 120)}px` }}
                        />
                        <span className="text-[10px] text-gray-400 mt-2 text-center leading-tight">{week.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Review Accuracy Trend */}
              <section className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Review Accuracy Trend</h2>
                <p className="text-xs text-gray-500 mb-3">Last 30 days</p>
                {accuracyData && <LineChart data={accuracyData} />}
              </section>

              {/* Two-column: Donut + Top Words */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Word Strength Distribution - Donut */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-4">Word Strength Distribution</h2>
                  {strengthDist && (
                    <div className="flex flex-col items-center">
                      <DonutChart
                        data={[strengthDist.weak, strengthDist.growing, strengthDist.strong, strengthDist.mastered]}
                        colors={["#ef4444", "#f59e0b", "#22c55e", "#3b82f6"]}
                        total={totalWords}
                      />
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4">
                        {[
                          { label: "Weak", color: "#ef4444", count: strengthDist.weak },
                          { label: "Growing", color: "#f59e0b", count: strengthDist.growing },
                          { label: "Strong", color: "#22c55e", count: strengthDist.strong },
                          { label: "Mastered", color: "#3b82f6", count: strengthDist.mastered },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-xs text-gray-600">
                              {item.label} ({item.count})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Streak Calendar */}
                <section className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-900">Streak Calendar</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-blue-600">{currentStreak}</span>
                      <span className="text-xs text-gray-500">day streak</span>
                    </div>
                  </div>
                  {streakHistory && (
                    <div className="flex flex-wrap gap-[3px]">
                      {streakHistory.map((day, i) => (
                        <div
                          key={i}
                          className="w-[10px] h-[10px] rounded-sm transition-all"
                          style={{ backgroundColor: streakColor(day.active) }}
                          title={`${formatDate(day.date)}: ${day.active ? "Active" : "Inactive"}`}
                        />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-400">
                    <div className="w-[10px] h-[10px] rounded-sm" style={{ backgroundColor: "#e5e7eb" }} />
                    <span>Inactive</span>
                    <div className="w-[10px] h-[10px] rounded-sm ml-2" style={{ backgroundColor: "#3b82f6" }} />
                    <span>Active</span>
                  </div>
                </section>
              </div>

              {/* Top 10 Strongest & Weakest Words */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <WordList title="Top 10 Strongest Words" words={strongestWords ?? []} colorFrom="#22c55e" colorTo="#15803d" />
                <WordList title="Top 10 Weakest Words" words={weakestWords ?? []} colorFrom="#f59e0b" colorTo="#ef4444" />
              </div>
    </div>
  );
}

// --- Word List Sub-component ---
function WordList({
  title,
  words,
  colorFrom,
  colorTo,
}: {
  title: string;
  words: { word: string; translation: string; strength: number; reviewCount: number; status: string }[];
  colorFrom: string;
  colorTo: string;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">{title}</h2>
      {words.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No words yet</p>
      ) : (
        <div className="space-y-2">
          {words.map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 truncate">{w.word}</span>
                  <span className="text-xs text-gray-500 ml-2 shrink-0">{w.strength}%</span>
                </div>
                <p className="text-xs text-gray-400 truncate">{w.translation}</p>
                <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${w.strength}%`,
                      background: `linear-gradient(to right, ${colorFrom}, ${colorTo})`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
