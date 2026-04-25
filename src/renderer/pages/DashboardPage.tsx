/**
 * DashboardPage — Main productivity dashboard with i18n support.
 */

import React, { useEffect, useState } from 'react';
import { getIPC, type DailySummary, type SevenDayTrendEntry, type CalendarEventInfo } from '../ipc.js';
import { getClassificationColor } from '../utils/colorBlind.js';
import { t, type Language } from '../i18n/translations.js';

interface DashboardPageProps {
  colorBlindMode?: boolean;
  lang?: Language;
}

function msToHours(ms: number): string {
  return (ms / (1000 * 60 * 60)).toFixed(1);
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  return ((part / total) * 100).toFixed(1) + '%';
}

export default function DashboardPage({ colorBlindMode = false, lang = 'en' }: DashboardPageProps): React.ReactElement {
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
    <div className="dashboard-page" role="main" aria-label={t('tabDashboard', lang)}>
      <h2>{t('todaySummary', lang)}</h2>

      {summary ? (
        <div className="daily-summary" role="region" aria-label={t('todaySummary', lang)}>
          <div className="summary-total">
            {t('totalTracked', lang)}: <strong>{msToHours(summary.totalTrackedMs)}h</strong>
          </div>
          <div className="summary-breakdown">
            <div style={{ color: getClassificationColor('deep_work', colorBlindMode) }}>
              {t('deepWork', lang)}: {msToHours(summary.deepWorkMs)}h ({pct(summary.deepWorkMs, summary.totalTrackedMs)})
            </div>
            <div style={{ color: getClassificationColor('shallow_work', colorBlindMode) }}>
              {t('shallowWork', lang)}: {msToHours(summary.shallowWorkMs)}h ({pct(summary.shallowWorkMs, summary.totalTrackedMs)})
            </div>
            <div style={{ color: getClassificationColor('distraction_loop', colorBlindMode) }}>
              {t('distractionLoops', lang)}: {msToHours(summary.distractionLoopMs)}h ({pct(summary.distractionLoopMs, summary.totalTrackedMs)})
            </div>
          </div>
        </div>
      ) : (
        <p>{t('loading', lang)}</p>
      )}

      {calendarEvent && (
        <div className="calendar-event" role="status">
          📅 <strong>{calendarEvent.title}</strong>
        </div>
      )}

      <h2>{t('sevenDayTrend', lang)}</h2>

      {trend.length > 0 ? (
        <div className="trend-chart" role="img" aria-label={t('sevenDayTrend', lang)}>
          {trend.map((entry) => {
            const hours = Number(msToHours(entry.deepWorkMs));
            const barHeight = Math.max(hours * 20, 2);
            return (
              <div key={entry.date} className="trend-bar-container" title={`${entry.date}: ${hours}h ${t('deepWork', lang)}`}>
                <div
                  className="trend-bar"
                  style={{ height: `${barHeight}px`, backgroundColor: getClassificationColor('deep_work', colorBlindMode) }}
                  role="presentation"
                />
                <span className="trend-label">{entry.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p>{t('noTrendData', lang)}</p>
      )}
    </div>
  );
}
