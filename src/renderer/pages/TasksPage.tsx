/**
 * TasksPage — Gamified task manager with XP, badges, and progression.
 *
 * Task list with create/edit/delete/reorder, priority selector, due date picker.
 * Displays XP total and earned badges with notification on new badge award.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getIPC, type TaskInfo, type BadgeInfo } from '../ipc.js';

const PRIORITY_LABELS: Record<string, string> = {
  low: '🟢 Low',
  medium: '🟡 Medium',
  high: '🔴 High',
};

const PRIORITY_XP: Record<string, string> = {
  low: '10 XP',
  medium: '25 XP',
  high: '50 XP',
};

export default function TasksPage(): React.ReactElement {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [totalXP, setTotalXP] = useState(0);
  const [badges, setBadges] = useState<BadgeInfo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [badgeNotification, setBadgeNotification] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const ipc = getIPC();
    const [t, xp, b] = await Promise.all([
      ipc.getTasks(),
      ipc.getTotalXP(),
      ipc.getBadges(),
    ]);
    setTasks(t);
    setTotalXP(xp);

    // Check for newly awarded badges
    const prevAwarded = badges.filter((b) => b.awardedAt != null).map((b) => b.id);
    const newAwarded = b.filter((b) => b.awardedAt != null && !prevAwarded.includes(b.id));
    if (newAwarded.length > 0) {
      setBadgeNotification(`🏆 Badge earned: ${newAwarded.map((b) => b.name).join(', ')}!`);
      setTimeout(() => setBadgeNotification(null), 5000);
    }

    setBadges(b);
  }, [badges]);

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    const ipc = getIPC();
    const dueDate = newDueDate ? new Date(newDueDate).getTime() : undefined;
    await ipc.createTask(newTitle.trim(), newPriority, dueDate);
    setNewTitle('');
    setNewDueDate('');
    await refresh();
  }, [newTitle, newPriority, newDueDate, refresh]);

  const handleComplete = useCallback(async (id: string) => {
    const ipc = getIPC();
    await ipc.completeTask(id, false); // deep work detection handled by main process
    await refresh();
  }, [refresh]);

  const handleDelete = useCallback(async (id: string) => {
    const ipc = getIPC();
    await ipc.deleteTask(id);
    await refresh();
  }, [refresh]);

  const handleEditSave = useCallback(async () => {
    if (!editingId || !editTitle.trim()) return;
    const ipc = getIPC();
    await ipc.updateTask(editingId, { title: editTitle.trim() });
    setEditingId(null);
    setEditTitle('');
    await refresh();
  }, [editingId, editTitle, refresh]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    }
  }, [handleCreate]);

  return (
    <div className="tasks-page" role="main" aria-label="Task Manager">
      {/* XP and Badges */}
      <div className="xp-section" role="region" aria-label="XP and badges">
        <div className="xp-total" style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          ⚡ {totalXP} XP
        </div>
        <div className="badges" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {badges.map((badge) => (
            <span
              key={badge.id}
              className={`badge ${badge.awardedAt ? 'earned' : 'locked'}`}
              title={`${badge.description} (${badge.xpThreshold} XP)`}
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.85rem',
                backgroundColor: badge.awardedAt ? '#fef3c7' : '#f1f5f9',
                color: badge.awardedAt ? '#92400e' : '#94a3b8',
                border: badge.awardedAt ? '1px solid #fbbf24' : '1px solid #e2e8f0',
              }}
            >
              {badge.awardedAt ? '🏆' : '🔒'} {badge.name}
            </span>
          ))}
        </div>
      </div>

      {/* Badge notification */}
      {badgeNotification && (
        <div
          className="badge-notification"
          role="alert"
          style={{
            padding: '0.75rem',
            backgroundColor: '#fef3c7',
            border: '1px solid #fbbf24',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontWeight: 600,
          }}
        >
          {badgeNotification}
        </div>
      )}

      {/* Create task form */}
      <div className="create-task" role="form" aria-label="Create new task" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="New task…"
          aria-label="Task title"
          style={{ flex: 1, minWidth: '200px', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as 'low' | 'medium' | 'high')}
          aria-label="Task priority"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        >
          <option value="low">Low (10 XP)</option>
          <option value="medium">Medium (25 XP)</option>
          <option value="high">High (50 XP)</option>
        </select>
        <input
          type="date"
          value={newDueDate}
          onChange={(e) => setNewDueDate(e.target.value)}
          aria-label="Due date"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
        />
        <button
          onClick={handleCreate}
          disabled={!newTitle.trim()}
          aria-label="Add task"
          style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer' }}
        >
          Add
        </button>
      </div>

      {/* Task list */}
      <ul className="task-list" role="list" aria-label="Tasks" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`task-item ${task.completed ? 'completed' : ''}`}
            role="listitem"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem',
              borderBottom: '1px solid #e2e8f0',
              opacity: task.completed ? 0.6 : 1,
            }}
          >
            {/* Complete checkbox */}
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => !task.completed && handleComplete(task.id)}
              disabled={task.completed}
              aria-label={`Mark "${task.title}" as complete`}
            />

            {/* Title (editable) */}
            {editingId === task.id ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleEditSave}
                onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
                autoFocus
                aria-label="Edit task title"
                style={{ flex: 1, padding: '0.25rem', border: '1px solid #2563eb', borderRadius: '4px' }}
              />
            ) : (
              <span
                style={{ flex: 1, textDecoration: task.completed ? 'line-through' : 'none', cursor: 'pointer' }}
                onClick={() => { setEditingId(task.id); setEditTitle(task.title); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') { setEditingId(task.id); setEditTitle(task.title); } }}
                aria-label={`Edit "${task.title}"`}
              >
                {task.title}
              </span>
            )}

            {/* Priority badge */}
            <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
              {PRIORITY_LABELS[task.priority]} ({PRIORITY_XP[task.priority]})
            </span>

            {/* Due date */}
            {task.dueDate && (
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                📅 {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}

            {/* XP awarded */}
            {task.xpAwarded > 0 && (
              <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>
                +{task.xpAwarded} XP
              </span>
            )}

            {/* Delete button */}
            <button
              onClick={() => handleDelete(task.id)}
              aria-label={`Delete "${task.title}"`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1.1rem' }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {tasks.length === 0 && (
        <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: '2rem' }}>
          No tasks yet. Add one above to start earning XP!
        </p>
      )}
    </div>
  );
}
