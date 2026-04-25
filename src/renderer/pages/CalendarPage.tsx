/**
 * CalendarPage — Google Calendar integration with weekly view,
 * focus block scheduling, and event-activity correlation.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { t, type Language } from '../i18n/translations.js';

interface CalendarPageProps { lang?: Language; }

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
  type: 'meeting' | 'focus' | 'personal' | 'break';
}

// ─── Static Demo Events ─────────────────────────────────────────────────────

function getWeekDates(): string[] {
  const dates: string[] = [];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function makeDayEvents(dateStr: string, dayIndex: number): CalendarEvent[] {
  const base = new Date(dateStr + 'T00:00:00').getTime();
  const h = (hour: number, min = 0) => base + hour * 3600000 + min * 60000;

  const templates: CalendarEvent[][] = [
    // Monday
    [
      { id: `${dateStr}-1`, title: 'Sprint Planning', startTime: h(9), endTime: h(10), color: '#818cf8', type: 'meeting' },
      { id: `${dateStr}-2`, title: '⚡ Deep Work: Auth Flow', startTime: h(10), endTime: h(12), color: '#34d399', type: 'focus' },
      { id: `${dateStr}-3`, title: 'Lunch', startTime: h(12), endTime: h(13), color: '#64748b', type: 'break' },
      { id: `${dateStr}-4`, title: 'Code Review', startTime: h(14), endTime: h(15), color: '#818cf8', type: 'meeting' },
      { id: `${dateStr}-5`, title: '⚡ Deep Work: Tests', startTime: h(15), endTime: h(17), color: '#34d399', type: 'focus' },
    ],
    // Tuesday
    [
      { id: `${dateStr}-1`, title: '⚡ Deep Work: Classifier', startTime: h(8), endTime: h(10, 30), color: '#34d399', type: 'focus' },
      { id: `${dateStr}-2`, title: 'Design Sync', startTime: h(11), endTime: h(11, 45), color: '#818cf8', type: 'meeting' },
      { id: `${dateStr}-3`, title: 'Lunch', startTime: h(12), endTime: h(13), color: '#64748b', type: 'break' },
      { id: `${dateStr}-4`, title: '⚡ Deep Work: Heatmap', startTime: h(13, 30), endTime: h(16), color: '#34d399', type: 'focus' },
      { id: `${dateStr}-5`, title: 'Gym', startTime: h(17, 30), endTime: h(18, 30), color: '#fbbf24', type: 'personal' },
    ],
    // Wednesday
    [
      { id: `${dateStr}-1`, title: 'Standup', startTime: h(9), endTime: h(9, 15), color: '#818cf8', type: 'meeting' },
      { id: `${dateStr}-2`, title: '⚡ Deep Work: Prediction', startTime: h(9, 30), endTime: h(12), color: '#34d399', type: 'focus' },
      { id: `${dateStr}-3`, title: 'Lunch', startTime: h(12), endTime: h(13), color: '#64748b', type: 'break' },
      { id: `${dateStr}-4`, title: '1:1 with Manager', startTime: h(14), endTime: h(14, 30), color: '#818cf8', type: 'meeting' },
      { id: `${dateStr}-5`, title: '⚡ Deep Work: Dashboard', startTime: h(15), endTime: h(17, 30), color: '#34d399', type: 'focus' },
    ],
    // Thursday
    [
      { id: `${dateStr}-1`, title: '⚡ Deep Work: CalendarSync', startTime: h(8), endTime: h(11), color: '#34d399', type: 'focus' },
      { id: `${dateStr}-2`, title: 'Team Retro', startTime: h(11), endTime: h(12), color: '#818cf8', type: 'meeting' },
      { id: `${dateStr}-3`, title: 'Lunch', startTime: h(12), endTime: h(13), color: '#64748b', type: 'break' },
      { id: `${dateStr}-4`, title: '⚡ Deep Work: NetworkGuard', startTime: h(14), endTime: h(16, 30), color: '#34d399', type: 'focus' },
      { id: `${dateStr}-5`, title: 'Dentist', startTime: h(17), endTime: h(18), color: '#fbbf24', type: 'personal' },
    ],
    // Friday
    [
      { id: `${dateStr}-1`, title: 'Standup', startTime: h(9), endTime: h(9, 15), color: '#818cf8', type: 'meeting' },
      { id: `${dateStr}-2`, title: '⚡ Deep Work: Integration', startTime: h(9, 30), endTime: h(12), color: '#34d399', type: 'focus' },
      { id: `${dateStr}-3`, title: 'Lunch', startTime: h(12), endTime: h(13), color: '#64748b', type: 'break' },
      { id: `${dateStr}-4`, title: 'Demo & Showcase', startTime: h(14), endTime: h(15), color: '#818cf8', type: 'meeting' },
      { id: `${dateStr}-5`, title: 'Weekly Review', startTime: h(15, 30), endTime: h(16), color: '#818cf8', type: 'meeting' },
    ],
    // Saturday
    [
      { id: `${dateStr}-1`, title: 'Side Project', startTime: h(10), endTime: h(12), color: '#fbbf24', type: 'personal' },
    ],
    // Sunday
    [],
  ];

  return templates[dayIndex % 7] ?? [];
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const CARD = { background: '#1B1D36', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 24 };
const LABEL = { fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', color: '#64748b', textTransform: 'uppercase' as const };
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7am–7pm

const TYPE_ICONS: Record<string, string> = { meeting: 'groups', focus: 'bolt', personal: 'person', break: 'coffee' };

// ─── Component ───────────────────────────────────────────────────────────────

export default function CalendarPage({ lang = 'en' }: CalendarPageProps): React.ReactElement {
  const [connected, setConnected] = useState(true); // demo: already connected
  const [weekDates] = useState(getWeekDates);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Compute weekly stats
  const allEvents = weekDates.flatMap((d, i) => makeDayEvents(d, i));
  const focusBlocks = allEvents.filter(e => e.type === 'focus');
  const meetingBlocks = allEvents.filter(e => e.type === 'meeting');
  const totalFocusMs = focusBlocks.reduce((s, e) => s + (e.endTime - e.startTime), 0);
  const totalMeetingMs = meetingBlocks.reduce((s, e) => s + (e.endTime - e.startTime), 0);
  const focusHours = (totalFocusMs / 3600000).toFixed(1);
  const meetingHours = (totalMeetingMs / 3600000).toFixed(1);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span style={{ ...LABEL, color: '#cebdff', display: 'block', marginBottom: 8 }}>Calendar Integration</span>
          <h2 style={{ fontFamily: 'Inter', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {t(lang, 'calendar')}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {connected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#34d399' }}>check_circle</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#34d399' }}>Google Calendar Connected</span>
            </div>
          ) : (
            <button onClick={() => setConnected(true)} style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', background: '#a78bfa',
              color: '#0A0B1A', cursor: 'pointer', fontWeight: 600, fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>link</span>
              Connect Google Calendar
            </button>
          )}
          <button onClick={() => setConnected(!connected)} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid #2B2930',
            background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 12,
          }}>
            {connected ? 'Disconnect' : 'Skip'}
          </button>
        </div>
      </div>

      {/* Weekly Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div style={CARD}>
          <p style={LABEL}>Focus Blocks</p>
          <h3 style={{ fontFamily: "'JetBrains Mono'", fontSize: 28, fontWeight: 500, color: '#34d399', marginTop: 8 }}>{focusBlocks.length}</h3>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>this week</p>
        </div>
        <div style={CARD}>
          <p style={LABEL}>Focus Hours</p>
          <h3 style={{ fontFamily: "'JetBrains Mono'", fontSize: 28, fontWeight: 500, color: '#34d399', marginTop: 8 }}>{focusHours}</h3>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>scheduled deep work</p>
        </div>
        <div style={CARD}>
          <p style={LABEL}>Meetings</p>
          <h3 style={{ fontFamily: "'JetBrains Mono'", fontSize: 28, fontWeight: 500, color: '#818cf8', marginTop: 8 }}>{meetingBlocks.length}</h3>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>this week</p>
        </div>
        <div style={CARD}>
          <p style={LABEL}>Meeting Hours</p>
          <h3 style={{ fontFamily: "'JetBrains Mono'", fontSize: 28, fontWeight: 500, color: '#818cf8', marginTop: 8 }}>{meetingHours}</h3>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>time in meetings</p>
        </div>
      </div>

      {/* Weekly Calendar Grid */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        {/* Day Headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', borderBottom: '1px solid #2B2930' }}>
          <div style={{ padding: 12 }} />
          {weekDates.map((d, i) => {
            const isToday = d === todayStr;
            const dayNum = new Date(d).getDate();
            return (
              <div key={d} style={{
                padding: '12px 8px', textAlign: 'center',
                borderLeft: '1px solid #2B2930',
                background: isToday ? 'rgba(167,139,250,0.05)' : 'transparent',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? '#a78bfa' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {DAY_NAMES[i]}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono'", fontSize: 20, fontWeight: 700, marginTop: 4,
                  color: isToday ? '#a78bfa' : '#e6e0ea',
                  ...(isToday ? { background: 'rgba(167,139,250,0.15)', borderRadius: '50%', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } : {}),
                }}>
                  {dayNum}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', position: 'relative' }}>
          {/* Hour labels + rows */}
          {HOURS.map(hour => (
            <React.Fragment key={hour}>
              <div style={{ padding: '4px 8px', fontSize: 10, fontFamily: "'JetBrains Mono'", color: '#64748b', textAlign: 'right', height: 48, borderTop: '1px solid #1B1D36' }}>
                {hour <= 12 ? `${hour}AM` : `${hour - 12}PM`}
              </div>
              {weekDates.map((d, dayIdx) => {
                const isToday = d === todayStr;
                const dayEvents = makeDayEvents(d, dayIdx);
                const hourEvents = dayEvents.filter(e => {
                  const eHour = new Date(e.startTime).getHours();
                  return eHour === hour;
                });

                return (
                  <div key={`${d}-${hour}`} style={{
                    borderLeft: '1px solid #2B2930', borderTop: '1px solid rgba(255,255,255,0.02)',
                    height: 48, position: 'relative', padding: '2px 2px',
                    background: isToday ? 'rgba(167,139,250,0.02)' : 'transparent',
                  }}>
                    {hourEvents.map(evt => {
                      const durationMin = (evt.endTime - evt.startTime) / 60000;
                      const heightPx = Math.max(Math.min(durationMin * 0.8, 44), 18);
                      const startMin = new Date(evt.startTime).getMinutes();
                      const topOffset = (startMin / 60) * 44;

                      return (
                        <div
                          key={evt.id}
                          onClick={() => setSelectedEvent(selectedEvent?.id === evt.id ? null : evt)}
                          style={{
                            position: 'absolute', left: 2, right: 2, top: topOffset + 2,
                            height: heightPx, borderRadius: 4, padding: '2px 6px',
                            background: `${evt.color}20`, borderLeft: `3px solid ${evt.color}`,
                            cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s',
                            boxShadow: selectedEvent?.id === evt.id ? `0 0 12px ${evt.color}40` : 'none',
                            zIndex: selectedEvent?.id === evt.id ? 10 : 1,
                          }}
                        >
                          <span style={{ fontSize: 9, fontWeight: 600, color: evt.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                            {evt.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Event Detail + Focus Suggestions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Selected Event Detail */}
        <div style={CARD}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            {selectedEvent ? 'Event Details' : 'Select an Event'}
          </h3>
          {selectedEvent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="material-symbols-outlined" style={{ color: selectedEvent.color, fontSize: 20 }}>
                  {TYPE_ICONS[selectedEvent.type] ?? 'event'}
                </span>
                <div>
                  <h4 style={{ fontSize: 18, fontWeight: 700, color: '#e6e0ea' }}>{selectedEvent.title}</h4>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    {new Date(selectedEvent.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {new Date(selectedEvent.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: `${selectedEvent.color}15`, color: selectedEvent.color,
                  border: `1px solid ${selectedEvent.color}30`, textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {selectedEvent.type}
                </span>
                <span style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: 'rgba(255,255,255,0.05)', color: '#94a3b8',
                }}>
                  {Math.round((selectedEvent.endTime - selectedEvent.startTime) / 60000)} min
                </span>
              </div>
              {selectedEvent.type === 'focus' && (
                <div style={{ marginTop: 12, padding: 12, background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>⚡ Focus Block</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    SnapBack will track this as deep work and apply the 1.5x XP multiplier for tasks completed during this block.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: 14 }}>Click any event in the calendar to see details and focus insights.</p>
          )}
        </div>

        {/* AI Focus Suggestions */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span className="material-symbols-outlined" style={{ color: '#a78bfa', fontVariationSettings: "'FILL' 1" }}>psychology</span>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Smart Scheduling</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 12, background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#cebdff' }}>Peak Focus: 9:30 AM – 12:00 PM</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Your deep work ratio is 73% during this window. 3 focus blocks are scheduled here this week.</p>
            </div>
            <div style={{ padding: 12, background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>Meeting Cluster: Tue & Thu afternoons</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Consider batching meetings to protect morning focus blocks.</p>
            </div>
            <div style={{ padding: 12, background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#34d399' }}>Suggestion: Add a focus block Friday 10–12</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>You have a 2-hour gap after standup with no meetings — ideal for deep work.</p>
            </div>
          </div>
          <button style={{
            marginTop: 16, width: '100%', padding: '10px 20px', borderRadius: 8, border: 'none',
            background: '#a78bfa', color: '#0A0B1A', cursor: 'pointer', fontWeight: 600, fontSize: 12,
            letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>schedule</span>
            AUTO-SCHEDULE FOCUS BLOCKS
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
        {[
          { color: '#34d399', label: 'Focus Block' },
          { color: '#818cf8', label: 'Meeting' },
          { color: '#fbbf24', label: 'Personal' },
          { color: '#64748b', label: 'Break' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
