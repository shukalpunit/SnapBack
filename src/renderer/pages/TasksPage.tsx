/**
 * TasksPage — Gamified task manager matching the design system.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getIPC, type TaskInfo, type BadgeInfo } from '../ipc.js';
import { t, type Language } from '../i18n/translations.js';

interface TasksPageProps { lang?: Language; }

const CARD = { background: '#1B1D36', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 24 };
const LABEL = { fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', color: '#64748b', textTransform: 'uppercase' as const };
const PRIORITY_BORDER: Record<string, string> = { high: '#cebdff', medium: '#dbc839', low: '#948e9d' };
const PRIORITY_TAG_BG: Record<string, string> = { high: 'rgba(206,189,255,0.1)', medium: 'rgba(219,200,57,0.1)', low: 'rgba(148,142,157,0.1)' };
const PRIORITY_TAG_COLOR: Record<string, string> = { high: '#cebdff', medium: '#dbc839', low: '#948e9d' };

export default function TasksPage({ lang = 'en' }: TasksPageProps): React.ReactElement {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [totalXP, setTotalXP] = useState(0);
  const [badges, setBadges] = useState<BadgeInfo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [badgeNotification, setBadgeNotification] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const ipc = getIPC();
    const [ts, xp, bs] = await Promise.all([ipc.getTasks(), ipc.getTotalXP(), ipc.getBadges()]);
    const prevAwarded = badges.filter((b) => b.awardedAt != null).map((b) => b.id);
    const newAwarded = bs.filter((b) => b.awardedAt != null && !prevAwarded.includes(b.id));
    if (newAwarded.length > 0) {
      setBadgeNotification(`🏆 Badge earned: ${newAwarded.map((b) => b.name).join(', ')}!`);
      setTimeout(() => setBadgeNotification(null), 5000);
    }
    setTasks(ts); setTotalXP(xp); setBadges(bs);
  }, [badges]);

  useEffect(() => { refresh(); }, []); // eslint-disable-line

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    await getIPC().createTask(newTitle.trim(), newPriority);
    setNewTitle('');
    await refresh();
  }, [newTitle, newPriority, refresh]);

  const handleComplete = useCallback(async (id: string) => {
    await getIPC().completeTask(id, false);
    await refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    await getIPC().deleteTask(id);
    await refresh();
  }, [refresh]);

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}>{t(lang, 'manageTasks')}</h1>
          <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>{t(lang, 'manageFlowQueue')}</p>
        </div>
      </div>

      {/* Badge notification */}
      {badgeNotification && (
        <div style={{ padding: 12, background: 'rgba(219,200,57,0.1)', border: '1px solid #dbc839', borderRadius: 8, marginBottom: 16, fontWeight: 600, color: '#dbc839' }}>
          {badgeNotification}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Task List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Add Task */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder={t(lang, 'newTask')}
              style={{
                flex: 1, background: '#0A0B1A', border: 'none', borderRadius: 8, padding: '10px 16px',
                fontSize: 14, color: '#e6e0ea', outline: 'none', fontFamily: 'Inter',
              }}
            />
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as any)}
              style={{ background: '#0A0B1A', border: 'none', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#e6e0ea', fontFamily: "'JetBrains Mono'" }}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button onClick={handleCreate} disabled={!newTitle.trim()}
              style={{
                background: '#a78bfa', color: '#0A0B1A', border: 'none', borderRadius: 8,
                padding: '10px 20px', fontWeight: 600, fontSize: 12, letterSpacing: '0.05em',
                cursor: 'pointer', textTransform: 'uppercase',
              }}>
              {t(lang, 'addTask')}
            </button>
          </div>

          {/* Incomplete Tasks */}
          {incompleteTasks.map((task) => (
            <div key={task.id} style={{
              ...CARD, padding: 20, borderLeft: `4px solid ${PRIORITY_BORDER[task.priority]}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'default', transition: 'background 0.15s',
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#232542'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#1B1D36'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <input type="checkbox" checked={false} onChange={() => handleComplete(task.id)}
                  style={{ width: 20, height: 20, borderRadius: 4, cursor: 'pointer', accentColor: '#a78bfa' }} />
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600 }}>{task.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: PRIORITY_TAG_COLOR[task.priority], background: PRIORITY_TAG_BG[task.priority],
                      padding: '2px 8px', borderRadius: 4,
                    }}>
                      {task.priority}
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(task.id)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, opacity: 0.5, transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; (e.target as HTMLElement).style.color = '#f87171'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.5'; (e.target as HTMLElement).style.color = '#64748b'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
              </button>
            </div>
          ))}

          {/* Completed Tasks */}
          {completedTasks.map((task) => (
            <div key={task.id} style={{ ...CARD, padding: 20, borderLeft: '4px solid #494552', opacity: 0.4, display: 'flex', alignItems: 'center', gap: 16 }}>
              <input type="checkbox" checked disabled style={{ width: 20, height: 20, accentColor: '#a78bfa' }} />
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, textDecoration: 'line-through' }}>{task.title}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: '#64748b' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                  <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 12 }}>{t(lang, 'completed')}</span>
                </div>
              </div>
            </div>
          ))}

          {tasks.length === 0 && <p style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>{t(lang, 'noDataYet')}</p>}
        </div>

        {/* Stats Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Daily Focus Output */}
          <div style={{ ...CARD, border: '1px solid #232542' }}>
            <h2 style={LABEL}>{t(lang, 'dailyFocusOutput')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <div style={{ padding: 16, background: '#0A0B1A', borderRadius: 8 }}>
                <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 28, fontWeight: 500, color: '#cebdff' }}>{completedTasks.length.toString().padStart(2, '0')}</div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', fontWeight: 600, marginTop: 4 }}>{t(lang, 'completed')}</div>
              </div>
              <div style={{ padding: 16, background: '#0A0B1A', borderRadius: 8 }}>
                <div style={{ fontFamily: "'JetBrains Mono'", fontSize: 28, fontWeight: 500, color: '#dbc839' }}>{incompleteTasks.length.toString().padStart(2, '0')}</div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', fontWeight: 600, marginTop: 4 }}>{t(lang, 'remaining')}</div>
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>⚡ {totalXP} XP</span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div style={{ ...CARD, border: '1px solid #232542' }}>
            <h2 style={LABEL}>Badges</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {badges.map((badge) => (
                <span key={badge.id} title={`${badge.description} (${badge.xpThreshold} XP)`}
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                    background: badge.awardedAt ? 'rgba(219,200,57,0.1)' : '#0A0B1A',
                    color: badge.awardedAt ? '#dbc839' : '#64748b',
                    border: badge.awardedAt ? '1px solid rgba(219,200,57,0.3)' : '1px solid #232542',
                  }}>
                  {badge.awardedAt ? '🏆' : '🔒'} {badge.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
