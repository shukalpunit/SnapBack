/**
 * SettingsPage — Accessibility and app configuration with i18n.
 */

import React, { useState, useCallback } from 'react';
import type { AppSettings } from '../ipc.js';
import { t, LANGUAGE_OPTIONS, type Language } from '../i18n/translations.js';

const GHOST_POSITIONS = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

interface SettingsPageProps {
  onSettingsChange: (settings: AppSettings) => void;
  currentSettings: AppSettings;
  lang?: Language;
}

export default function SettingsPage({ onSettingsChange, currentSettings, lang = 'en' }: SettingsPageProps): React.ReactElement {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const settings = currentSettings;

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    onSettingsChange(updated);
  }, [settings, onSettingsChange]);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleDeleteAllData = useCallback(() => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    // In production, call IPC to delete data
    setDeleteConfirm(false);
    showStatus(t('deleteAllData', lang) + ' ✓');
  }, [deleteConfirm, lang]);

  return (
    <div className="settings-page" role="main" aria-label={t('settingsTitle', lang)}>
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
        <h3>{t('language', lang)}</h3>
        <select
          value={settings.language}
          onChange={(e) => updateSetting('language', e.target.value)}
          aria-label={t('language', lang)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', minWidth: '200px' }}
        >
          {LANGUAGE_OPTIONS.map((lo) => (
            <option key={lo.code} value={lo.code}>{lo.label}</option>
          ))}
        </select>
      </section>

      {/* Appearance */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>{t('appearance', lang)}</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.darkMode} onChange={(e) => updateSetting('darkMode', e.target.checked)} />
          {t('darkMode', lang)}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.colorBlindMode} onChange={(e) => updateSetting('colorBlindMode', e.target.checked)} />
          {t('colorBlindMode', lang)}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => updateSetting('reducedMotion', e.target.checked)} />
          {t('reducedMotion', lang)}
        </label>
      </section>

      {/* Ghost Bar */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>{t('ghostBar', lang)} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>({t('comingSoon', lang)})</span></h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.ghostBarEnabled} onChange={(e) => updateSetting('ghostBarEnabled', e.target.checked)} />
          {t('enableGhostBar', lang)}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {t('position', lang)}:
          <select value={settings.ghostBarPosition} onChange={(e) => updateSetting('ghostBarPosition', e.target.value as AppSettings['ghostBarPosition'])}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
            {GHOST_POSITIONS.map((pos) => (
              <option key={pos.value} value={pos.value}>{pos.label}</option>
            ))}
          </select>
        </label>
      </section>

      {/* Google Calendar */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>{t('googleCalendar', lang)}</h3>
        {settings.calendarAuthorized ? (
          <div>
            <span style={{ color: '#16a34a', marginRight: '1rem' }}>✓ {t('connected', lang)}</span>
            <button onClick={() => { updateSetting('calendarAuthorized', false); showStatus(t('revokeAccess', lang) + ' ✓'); }}
              style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', background: 'none', cursor: 'pointer' }}>
              {t('revokeAccess', lang)}
            </button>
          </div>
        ) : (
          <button onClick={() => { updateSetting('calendarAuthorized', true); showStatus(t('authorizeCalendar', lang) + ' ✓'); }}
            style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', backgroundColor: '#2563eb', color: 'white', cursor: 'pointer' }}>
            {t('authorizeCalendar', lang)}
          </button>
        )}
      </section>

      {/* Data Management */}
      <section style={{ marginBottom: '2rem' }}>
        <h3>{t('dataManagement', lang)}</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          {t('dataLocalMessage', lang)}
        </p>
        {deleteConfirm ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>{t('deleteConfirmMessage', lang)}</span>
            <button onClick={handleDeleteAllData}
              style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', backgroundColor: '#ef4444', color: 'white', cursor: 'pointer' }}>
              {t('confirmDelete', lang)}
            </button>
            <button onClick={() => setDeleteConfirm(false)}
              style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: 'none', cursor: 'pointer' }}>
              {t('cancel', lang)}
            </button>
          </div>
        ) : (
          <button onClick={handleDeleteAllData}
            style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', background: 'none', cursor: 'pointer' }}>
            {t('deleteAllData', lang)}
          </button>
        )}
      </section>
    </div>
  );
}
