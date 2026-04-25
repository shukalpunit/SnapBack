/**
 * DashboardPage — Main productivity dashboard.
 *
 * Displays daily summary, 7-day trend chart, classification breakdown,
 * and active calendar event name.
 *
 * Requirements: 2.6, 6.1, 6.2, 8.3
 */

import React, { useEffect, useState } from 'react';
import { getIPC, type DailySummary, type SevenDayTrendEntry, type CalendarEventInfo } from '../ipc.js';
import { getClassificationColor } from '../utils/colorBlind.js';

interface DashboardPageProps {
  colorBlindMode?: boolean;
}

function msToHours(ms: number): string {
  return (ms / (1000 * 60 * 60)).toFixed(1);
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  return ((part / total) * 100).toFixed(1) + '%';
}

export default function DashboardPage({ colorBlindMode = false }: DashboardPageProps): React.ReactElement {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [trend, setTrend] = useState<SevenDayTrendEntry[]>([]);
  const [calendarEvent, setCalendarEvent] = useState<CalendarEventInfo | null>(null);

  useEffect(() => {
    const ipc = getIPC();
    const today = new Date().toISOString().slice(0, 10);

    ipc.getDailySummary(today).then(setSummary);
    ipc.getSevenDayTrend().then(setTrend);
    ipc.getActiveCalendarEvent(Date.now()).then(setCalendarEvent);
  }, []);

  return (
    <div className="dashboard-page" role="main" aria-label="Productivity Dashboard">
      <h2>Today's Summary</h2>

      {summary ? (
        <div className="daily-summary" role="region" aria-label="Daily classification breakdown">
          <div className="summary-total">
            Total tracked: <strong>{msToHours(summary.totalTrackedMs)}h</strong>
          </div>

          <div className="summary-breakdown">
            <div
              className="breakdown-item"
              style={{ color: getClassificationColor('deep_work', colorBlindMode) }}
            >
              Deep Work: {msToHours(summary.deepWorkMs)}h ({pct(summary.deepWorkMs, summary.totalTrackedMs)})
            </div>
            <div
              className="breakdown-item"
              style={{ color: getClassificationColor('shallow_work', colorBlindMode) }}
            >
              Shallow Work: {msToHours(summary.shallowWorkMs)}h ({pct(summary.shallowWorkMs, summary.totalTrackedMs)})
            </div>
            <div
              className="breakdown-item"
              style={{ color: getClassificationColor('distraction_loop', colorBlindMode) }}
            >
              Distraction Loops: {msToHours(summary.distractionLoopMs)}h ({pct(summary.distractionLoopMs, summary.totalTrackedMs)})
            </div>
          </div>
        </div>
      ) : (
        <p>Loading…</p>
      )}

      {calendarEvent && (
        <div className="calendar-event" role="status" aria-label="Active calendar event">
          📅 <strong>{calendarEvent.title}</strong>
        </div>
      )}

      <h2>7-Day Deep Work Trend</h2>

      {trend.length > 0 ? (
        <div className="trend-chart" role="img" aria-label="7-day deep work trend chart">
          {trend.map((entry) => {
            const hours = Number(msToHours(entry.deepWorkMs));
            const barHeight = Math.max(hours * 20, 2);
            return (
              <div key={entry.date} className="trend-bar-container" title={`${entry.date}: ${hours}h deep work`}>
                <div
                  className="trend-bar"
                  style={{
                    height: `${barHeight}px`,
                    backgroundColor: getClassificationColor('deep_work', colorBlindMode),
                  }}
                  role="presentation"
                />
                <span className="trend-label">{entry.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p>No trend data yet.</p>
      )}
    </div>
  );
}
