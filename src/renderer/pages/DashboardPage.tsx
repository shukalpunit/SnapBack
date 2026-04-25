/**
 * DashboardPage — Main productivity dashboard matching the design system.
 * Dark esports-dashboard aesthetic with summary stats, progress ring, timeline, and app breakdown.
 */

import React, { useEffect, useState } from 'react';
import { getIPC, type DailySummary, type SevenDayTrendEntry } from '../ipc.js';
import { t, type Language } from '../i18n/translations.js';

interface DashboardPageProps {
  colorBlindMode?: boolean;
  lang?: Language;
}

function msToHours(ms: number): string {
  return (ms / (1000 * 60 * 60)).toFixed(1);
}

const CARD = { background: '#1B1D36', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 24 };
const LABEL = { fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', color: '#64748b', textTransform: 'uppercase' as const, marginBottom: 8 };
const DATA = { fontFamily: "'JetBrains Mono'", fontSize: 28, fontWeight: 500, lineHeight: 1 };

export default function DashboardPage({ colorBlindMode = false, lang = 'en' }: DashboardPageProps): React.ReactElement {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [trend, setTrend] = useState<SevenDayTrendEntry[]>([]);

  useEffect(() => {
    const ipc = getIPC();
    const today = new Date().toISOString().slice(0, 10);
    ipc.getDailySummary(today).then(setSummary);
    ipc.getSevenDayTrend().then(setTrend);
  }, []);

  const total = summary ? Number(msToHours(summary.totalTrackedMs)) : 0;
  const deep = summary ? Number(msToHours(summary.deepWorkMs)) : 0;
  const shallow = summary ? Number(msToHours(summary.shallowWorkMs)) : 0;
  const distraction = summary ? Number(msToHours(summary.distractionLoopMs)) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Predictive Alert Banner */}
      <div style={{
        position: 'relative', overflow: 'hidden', background: 'rgba(167,139,250,0.05)',
        border: '1px solid rgba(167,139,250,0.2)', borderRadius: 12, padding: 16,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span className="material-symbols-outlined" style={{ color: '#a78bfa', fontVariationSettings: "'FILL' 1" }}>psychology</span>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: '#a78bfa' }}>{t(lang, 'predictiveAlert')}</span>{' '}
          {t(lang, 'predictiveAlertMsg')}
        </p>
      </div>

      {/* Summary Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {/* Total Hours */}
        <div style={{ ...CARD, boxShadow: '0 0 20px rgba(167,139,250,0.03)' }}>
          <p style={LABEL}>{t(lang, 'totalHours')}</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 style={{ ...DATA, color: '#e6e0ea' }}>{total}</h3>
            <span style={{ fontSize: 14, color: '#94a3b8' }}>/ 8.0</span>
          </div>
          <div style={{ marginTop: 16, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((total / 8) * 100, 100)}%`, background: '#a78bfa', boxShadow: '0 0 10px rgba(167,139,250,0.4)' }} />
          </div>
        </div>

        {/* Deep Work */}
        <div style={{ ...CARD, boxShadow: '0 0 20px rgba(52,211,153,0.03)' }}>
          <p style={LABEL}>{t(lang, 'deepWork')}</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 style={{ ...DATA, color: '#34d399' }}>{deep}</h3>
            <span style={{ fontSize: 14, color: '#94a3b8' }}>{t(lang, 'hrs')}</span>
          </div>
          <div style={{ marginTop: 16, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((deep / 8) * 100, 100)}%`, background: '#34d399', boxShadow: '0 0 10px rgba(52,211,153,0.4)' }} />
          </div>
        </div>

        {/* Shallow Work */}
        <div style={{ ...CARD, boxShadow: '0 0 20px rgba(251,191,36,0.03)' }}>
          <p style={LABEL}>{t(lang, 'shallowWork')}</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 style={{ ...DATA, color: '#fbbf24' }}>{shallow}</h3>
            <span style={{ fontSize: 14, color: '#94a3b8' }}>{t(lang, 'hrs')}</span>
          </div>
          <div style={{ marginTop: 16, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((shallow / 8) * 100, 100)}%`, background: '#fbbf24', boxShadow: '0 0 10px rgba(251,191,36,0.4)' }} />
          </div>
        </div>

        {/* Distraction */}
        <div style={{ ...CARD, boxShadow: '0 0 20px rgba(248,113,113,0.03)' }}>
          <p style={LABEL}>{t(lang, 'distraction')}</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 style={{ ...DATA, color: '#f87171' }}>{distraction}</h3>
            <span style={{ fontSize: 14, color: '#94a3b8' }}>{t(lang, 'hrs')}</span>
          </div>
          <div style={{ marginTop: 16, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((distraction / 8) * 100, 100)}%`, background: '#f87171', boxShadow: '0 0 10px rgba(248,113,113,0.4)' }} />
          </div>
        </div>
      </div>

      {/* Flow Quota Ring + Deep Focus Streak */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0', position: 'relative' }}>
          <div style={{ position: 'relative', width: 256, height: 256, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="256" height="256" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="128" cy="128" r="120" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
              <circle cx="128" cy="128" r="120" fill="transparent" stroke="#a78bfa"
                strokeWidth="12" strokeDasharray="753.98"
                strokeDashoffset={753.98 - (753.98 * Math.min(deep / 8, 1))}
                style={{ filter: 'drop-shadow(0 0 15px rgba(167,139,250,0.6))' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <span style={LABEL}>{t(lang, 'flowQuota')}</span>
              <h2 style={{ fontFamily: "'JetBrains Mono'", fontSize: 42, lineHeight: 1, color: '#a78bfa', marginBottom: 4 }}>
                {deep} <span style={{ fontSize: 18, color: '#94a3b8', fontWeight: 500 }}>/ 8</span>
              </h2>
              <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#a78bfa', letterSpacing: '0.2em', fontWeight: 700, textTransform: 'uppercase' }}>{t(lang, 'hrsRealWork')}</span>
            </div>
            <div style={{ position: 'absolute', inset: 0, zIndex: -1, borderRadius: '50%', background: 'rgba(167,139,250,0.05)', filter: 'blur(40px)' }} />
          </div>
        </div>

        <div style={{ ...CARD, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontFamily: 'Inter', fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em' }}>{t(lang, 'optimalWindow')}</h2>
            <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>
              Your highest cognitive performance usually occurs between 10:00 AM and 1:30 PM.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
            <button style={{
              background: '#a78bfa', color: '#0F1023', fontWeight: 600, fontSize: 12,
              letterSpacing: '0.05em', padding: '8px 24px', borderRadius: 8, border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
              {t(lang, 'scheduleDeepBlock')}
            </button>
            <button style={{
              border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', fontWeight: 600,
              fontSize: 12, letterSpacing: '0.05em', padding: '8px 24px', borderRadius: 8,
              background: 'none', cursor: 'pointer',
            }}>
              {t(lang, 'viewTrends')}
            </button>
          </div>
        </div>
      </div>

      {/* 7-Day Trend */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'Inter', fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em' }}>{t(lang, 'dailyTimeline')}</h2>
          <span style={LABEL}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
          {trend.map((entry) => {
            const hours = Number(msToHours(entry.deepWorkMs));
            const barHeight = Math.max(hours * 15, 4);
            return (
              <div key={entry.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: '100%', height: barHeight, background: '#34d399', borderRadius: 4,
                  boxShadow: '0 0 10px rgba(52,211,153,0.3)', transition: 'height 0.3s',
                }} />
                <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#64748b' }}>{entry.date.slice(5)}</span>
              </div>
            );
          })}
          {trend.length === 0 && <p style={{ color: '#64748b', fontSize: 14 }}>{t(lang, 'noDataYet')}</p>}
        </div>
      </div>
    </div>
  );
}
