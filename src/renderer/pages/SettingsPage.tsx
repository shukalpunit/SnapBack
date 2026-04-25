/**
 * SettingsPage — Accessibility and app configuration.
 *
 * Controls for: language (≥5 options), dark mode, color blind mode,
 * reduced motion, Ghost Bar toggle + position, Calendar Sync, data deletion.
 * All settings apply immediately without restart.
 *
 * Requirements: 9.4, 10.1, 10.2, 10.3, 10.4, 10.5
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getIPC, type AppSettings } from '../ipc.js';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'pt', label: 'Português' },
];

const GHOST_POSITIONS = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

interface SettingsPageProps {
  onSettingsChange?: (settings: AppSettings) => void;
}

export default function SettingsPage({ onSettingsChange }: SettingsPageProps): React.ReactElement {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    getIPC().getSettings().then(setSettings);
  }, []);

  const updateSetting = useCallback(async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const ipc = getIPC();
    const updated = await ipc.updateSettings({ [key]: value });
    setSettings(updated);
    onSettingsChange?.(updated);
  }, [onSettingsChange]);

  const handleAuthorizeCalendar = useCallback(async () => {
    try {
      await getIPC().authorizeCalendar();
      await updateSetting('calendarAuthorized', true);
      showStatus('Google Calendar authorized.');
    } catch {
      showStatus('Calendar authorization failed.');
    }
  }, [updateSetting]);

  const handleRevokeCalendar = useCallback(async () => {
    try {
      await getIPC().revokeCalendar();
      await updateSetting('calendarAuthorized', false);
      showStatus('Google Calendar access revoked.');
    } catch {
      showStatus('Calendar revocation failed.');
    }
  }, [updateSetting]);

  const handleDeleteAllData = useCallback(async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    try {
      await getIPC().deleteAllData();
      setDeleteConfirm(false);
      showStatus('All data has been permanently deleted.');
    } catch {
      showStatus('Data deletion failed.');
    }
  }, [deleteConfirm]);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  if (!settings) return <p>Loading settings…</p>;

  return (
    <div className="settings-page" role="main" aria-label="Settings">
      {statusMessage && (
        <div role="status" aria-live="polite" style={{
          padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#f0fdf4',
          border: '1px solid #86efac', borderRadius: '6px',
        }}>
          {statusMessage}
        </div>
      )}

      {/* Language */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>Language</h3>
        <select
          value={settings.language}
          onChange={(e) => updateSetting('language', e.target.value)}
          aria-label="Display language"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', minWidth: '200px' }}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.label}</option>
          ))}
        </select>
      </section>

      {/* Appearance */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>Appearance</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.darkMode}
            onChange={(e) => updateSetting('darkMode', e.target.checked)}
            aria-label="Dark mode"
          />
          Dark Mode
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.colorBlindMode}
            onChange={(e) => updateSetting('colorBlindMode', e.target.checked)}
            aria-label="Color blind mode"
          />
          Color Blind Mode
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.reducedMotion}
            onChange={(e) => updateSetting('reducedMotion', e.target.checked)}
            aria-label="Reduced motion"
          />
          Reduced Motion
        </label>
      </section>

      {/* Ghost Bar (deferred feature — controls present but non-functional until Task 7) */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>Productivity Ghost <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>(coming soon)</span></h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.ghostBarEnabled}
            onChange={(e) => updateSetting('ghostBarEnabled', e.target.checked)}
            aria-label="Enable Ghost Bar"
          />
          Enable Ghost Bar
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Position:
          <select
            value={settings.ghostBarPosition}
            onChange={(e) => updateSetting('ghostBarPosition', e.target.value as AppSettings['ghostBarPosition'])}
            aria-label="Ghost Bar position"
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          >
            {GHOST_POSITIONS.map((pos) => (
              <option key={pos.value} value={pos.value}>{pos.label}</option>
            ))}
          </select>
        </label>
      </section>

      {/* Google Calendar */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>Google Calendar</h3>
        {settings.calendarAuthorized ? (
          <div>
            <span style={{ color: '#16a34a', marginRight: '1rem' }}>✓ Connected</span>
            <button
              onClick={handleRevokeCalendar}
              aria-label="Revoke Google Calendar access"
              style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', background: 'none', cursor: 'pointer' }}
            >
              Revoke Access
            </button>
          </div>
        ) : (
          <button
            onClick={handleAuthorizeCalendar}
            aria-label="Authorize Google Calendar"
            style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer' }}
          >
            Authorize Google Calendar
          </button>
        )}
      </section>

      {/* Data Management */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>Data Management</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          All your data is stored locally on this device and never leaves your machine.
        </p>
        {deleteConfirm ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>Are you sure? This cannot be undone.</span>
            <button
              onClick={handleDeleteAllData}
              aria-label="Confirm delete all data"
              style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', backgroundColor: '#ef4444', color: 'white', cursor: 'pointer' }}
            >
              Yes, Delete Everything
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              aria-label="Cancel deletion"
              style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleDeleteAllData}
            aria-label="Delete all data"
            style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', background: 'none', cursor: 'pointer' }}
          >
            Delete All Data
          </button>
        )}
      </section>
    </div>
  );
}
