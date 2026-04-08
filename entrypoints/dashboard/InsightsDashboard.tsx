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

// --- Reading Speed Chart SVG ---
function ReadingSpeedChart({ data }: { data: { date: string; avgWpm: number; avgComprehension: number; sessionCount: number }[] }) {
  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Filter out days with no sessions
  const validData = data.filter((d) => d.sessionCount > 0);

  if (validData.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        No reading sessions yet
      </div>
    );
  }

  // Find max values for scaling
  const maxWpm = Math.max(...validData.map((d) => d.avgWpm));
  const maxComprehension = 100; // Always 0-100%

  // Create points for both lines
  const wpmPoints = validData.map((d, i) => ({
    x: padding.left + (i / Math.max(validData.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.avgWpm / Math.max(maxWpm, 1)) * chartH,
    ...d,
  }));

  const comprehensionPoints = validData.map((d, i) => ({
    x: padding.left + (i / Math.max(validData.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.avgComprehension / 100) * chartH,
    ...d,
  }));

  const wpmPath = wpmPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const comprehensionPath = comprehensionPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          <span>Reading Speed (WPM)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span>Comprehension (%)</span>
        </div>
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Y-axis labels for WPM */}
        {[0, Math.round(maxWpm * 0.25), Math.round(maxWpm * 0.5), Math.round(maxWpm * 0.75), maxWpm].map((v) => (
          <text
            key={`wpm-${v}`}
            x={padding.left - 8}
            y={padding.top + chartH - (v / Math.max(maxWpm, 1)) * chartH + 4}
            textAnchor="end"
            fill="#3b82f6"
            fontSize="10"
          >
            {v}
          </text>
        ))}

        {/* Y-axis labels for comprehension (right side) */}
        {[0, 25, 50, 75, 100].map((v) => (
          <text
            key={`comp-${v}`}
            x={width - padding.right + 8}
            y={padding.top + chartH - (v / 100) * chartH + 4}
            textAnchor="start"
            fill="#22c55e"
            fontSize="10"
          >
            {v}%
          </text>
        ))}

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={padding.left}
            y1={padding.top + chartH * fraction}
            x2={width - padding.right}
            y2={padding.top + chartH * fraction}
            stroke="#f3f4f6"
            strokeWidth="1"
          />
        ))}

        {/* WPM Line */}
        <path d={wpmPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Comprehension Line */}
        <path d={comprehensionPath} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* WPM Data points */}
        {wpmPoints.map((p, i) => (
          <circle key={`wpm-${i}`} cx={p.x} cy={p.y} r="3" fill="#3b82f6" stroke="white" strokeWidth="1.5">
            <title>{`${formatDate(p.date)}: ${p.avgWpm} WPM`}</title>
          </circle>
        ))}

        {/* Comprehension Data points */}
        {comprehensionPoints.map((p, i) => (
          <circle key={`comp-${i}`} cx={p.x} cy={p.y} r="3" fill="#22c55e" stroke="white" strokeWidth="1.5">
            <title>{`${formatDate(p.date)}: ${p.avgComprehension}% comprehension`}</title>
          </circle>
        ))}

        {/* X-axis labels */}
        {wpmPoints.map((p, i) =>
          i % Math.ceil(wpmPoints.length / 6) === 0 ? (
            <text key={i} x={p.x} y={height - 5} textAnchor="middle" fill="#9ca3af" fontSize="9">
              {formatDate(p.date)}
            </text>
          ) : null
        )}
      </svg>
    </div>
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
  
  // Reading speed data
  const readingSpeedTrend = useQuery(api.analytics.getReadingSpeedTrend, { deviceId, days: 30 });
  const readingStatsByType = useQuery(api.analytics.getReadingStatsByContentType, { deviceId });
  const readingInsights = useQuery(api.analytics.getReadingInsights, { deviceId });

  const isLoading =
    heatmapData === undefined ||
    accuracyData === undefined ||
    strengthDist === undefined ||
    strongestWords === undefined ||
    weakestWords === undefined ||
    streakHistory === undefined ||
    readingSpeedTrend === undefined ||
    readingStatsByType === undefined ||
    readingInsights === undefined;

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
                <section className="stats-section stats-enter" style={{ animationDelay: "0ms", background: "linear-gradient(135deg, rgba(238,242,255,0.9), rgba(224,231,255,0.7))", borderColor: "rgba(165,180,252,0.3)" }}>
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    CEFR Progress Estimate
                  </h2>
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
                        className={`stats-cefr-badge flex-1 text-center py-1 text-xs font-medium ${
                          lvl === cefrInfo.level ? "active" : "inactive"
                        }`}
                      >
                        {lvl}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Activity Heatmap */}
              <section className="stats-section stats-enter" style={{ animationDelay: "80ms" }}>
                <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>
                  Activity Heatmap
                </h2>
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
                            className="stats-heatmap-cell"
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
              <section className="stats-section stats-enter" style={{ animationDelay: "160ms" }}>
                <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Words Per Week
                </h2>
                {wordsPerWeek.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
                ) : (
                  <div className="flex items-end gap-3 h-40">
                    {wordsPerWeek.map((week, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <span className="text-xs font-medium text-gray-700 mb-1">{week.count}</span>
                        <div
                          className="stats-chart-bar w-full"
                          style={{ height: `${Math.max(4, (week.count / maxBarCount) * 120)}px`, background: "linear-gradient(180deg, #818cf8, #6366f1)" }}
                        />
                        <span className="text-[10px] text-gray-400 mt-2 text-center leading-tight">{week.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Review Accuracy Trend */}
              <section className="stats-section stats-enter" style={{ animationDelay: "240ms" }}>
                <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                  Review Accuracy Trend
                </h2>
                <p className="text-xs text-gray-500 mb-3">Last 30 days</p>
                {accuracyData && <LineChart data={accuracyData} />}
              </section>

              {/* Reading Speed Dashboard */}
              {readingInsights && readingInsights.totalSessions > 0 && (
                <>
                  {/* Reading Progress Overview */}
                  <section className="stats-section stats-enter" style={{ animationDelay: "320ms", background: "linear-gradient(135deg, rgba(220,252,231,0.8), rgba(187,247,208,0.6))", borderColor: "rgba(110,231,183,0.3)" }}>
                    <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                      Reading Progress
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{readingInsights.totalSessions}</p>
                        <p className="text-xs text-gray-500">Sessions</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{readingInsights.avgWpm}</p>
                        <p className="text-xs text-gray-500">Avg WPM</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{Math.round(readingInsights.totalWordsRead / 1000)}k</p>
                        <p className="text-xs text-gray-500">Words Read</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">{readingInsights.avgComprehension}%</p>
                        <p className="text-xs text-gray-500">Comprehension</p>
                      </div>
                    </div>
                    
                    {readingInsights.bestWpmSession && (
                      <div className="mt-4 p-3 bg-green-100 rounded-lg">
                        <p className="text-xs font-medium text-green-800 mb-1 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                          Personal Best
                        </p>
                        <p className="text-sm text-green-700">
                          {readingInsights.bestWpmSession.wpm} WPM on {readingInsights.bestWpmSession.contentType} 
                          ({readingInsights.bestWpmSession.date})
                        </p>
                      </div>
                    )}
                  </section>

                  {/* Reading Speed Trend */}
                  <section className="stats-section stats-enter" style={{ animationDelay: "400ms" }}>
                    <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Reading Speed & Comprehension Trend
                    </h2>
                    <p className="text-xs text-gray-500 mb-3">Last 30 days</p>
                    {readingSpeedTrend && <ReadingSpeedChart data={readingSpeedTrend} />}
                  </section>

                  {/* Reading Stats by Content Type */}
                  <section className="stats-section stats-enter" style={{ animationDelay: "480ms" }}>
                    <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      Performance by Content Type
                    </h2>
                    {readingStatsByType && readingStatsByType.length > 0 ? (
                      <div className="space-y-3">
                        {readingStatsByType.map((stat, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className="w-5 h-5 flex items-center justify-center text-gray-600">
                                {stat.contentType === 'youtube' ? (
                                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                ) : stat.contentType === 'social' ? (
                                  <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                ) : stat.contentType === 'news' ? (
                                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                                ) : stat.contentType === 'reference' ? (
                                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                ) : (
                                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                )}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-gray-900 capitalize">{stat.contentType}</p>
                                <p className="text-xs text-gray-500">{stat.sessionCount} sessions</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-900">{stat.avgWpm} WPM</p>
                              <p className="text-xs text-gray-500">{stat.avgComprehension}% comprehension</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-6">No reading data yet</p>
                    )}
                  </section>
                </>
              )}

              {/* Two-column: Donut + Top Words */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Word Strength Distribution - Donut */}
                <section className="stats-section stats-enter" style={{ animationDelay: "560ms" }}>
                  <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                    Word Strength Distribution
                  </h2>
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
                <section className="stats-section stats-enter" style={{ animationDelay: "640ms" }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
                      Streak Calendar
                    </h2>
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
                          className="stats-streak-dot"
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

              {/* RPG Promotion */}
              <section className="stats-section stats-enter" style={{ animationDelay: "720ms", background: "linear-gradient(135deg, rgba(243,232,255,0.9), rgba(224,231,255,0.7))", borderColor: "rgba(196,181,253,0.3)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-purple-900 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Level Up Your Learning!
                    </h2>
                    <p className="text-purple-700 text-sm mb-3">
                      Check out your RPG dashboard for achievements, skill trees, daily challenges, and language pattern insights!
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      window.location.hash = 'rpg';
                      window.location.reload();
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
                  >
                    Open RPG Dashboard →
                  </button>
                </div>
              </section>
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
    <section className="stats-section stats-enter">
      <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
        {title}
      </h2>
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
                <div className="stats-word-bar">
                  <div
                    className="stats-word-bar-fill"
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
