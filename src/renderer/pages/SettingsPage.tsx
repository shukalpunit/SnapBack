/**
 * SettingsPage — Accessibility and app configuration with i18n.
 */

import React, { useState, useCallback } from 'react';
import type { AppSettings } from '../ipc.js';
import { t, LANGUAGE_OPTIONS, type Language } from '../i18n/translations.js';

const GHOST_POSITIONS: Array<{ value: string; labelKey: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }> = [
  { value: 'top-left', labelKey: 'topLeft' },
  { value: 'top-right', labelKey: 'topRight' },
  { value: 'bottom-left', labelKey: 'bottomLeft' },
  { value: 'bottom-right', labelKey: 'bottomRight' },
];

interface SettingsPageProps {
  onSettingsChange: (settings: AppSettings) => void;
  currentSettings: AppSettings;
  lang?: Language;
}

const CARD = { background: '#1B1D36', border: '1px solid #232542', borderRadius: 12, padding: 24 };
const SECTION_TITLE = { fontFamily: 'Inter', fontSize: 18, fontWeight: 600, color: '#e6e0ea', marginBottom: 16 };
const LABEL_STYLE = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer', fontSize: 14, color: '#e6e0ea' };
const INPUT_STYLE = { background: '#0A0B1A', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, color: '#e6e0ea', outline: 'none', minWidth: 200 };

export default function SettingsPage({ onSettingsChange, currentSettings, lang = 'en' }: SettingsPageProps): React.ReactElement {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const settings = currentSettings;

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  }, [settings, onSettingsChange]);

  const showStatus = (msg: string) => { setStatusMessage(msg); setTimeout(() => setStatusMessage(null), 4000); };

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontFamily: 'Inter', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}>{t(lang, 'settings')}</h1>

      {statusMessage && (
        <div style={{ padding: 12, background: 'rgba(52,211,153,0.1)', border: '1px solid #34d399', borderRadius: 8, color: '#34d399', fontWeight: 500 }}>
          {statusMessage}
        </div>
      )}

      {/* Language */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}>{t(lang, 'language')}</h3>
        <select value={settings.language} onChange={(e) => updateSetting('language', e.target.value)}
          aria-label={t(lang, 'language')} style={{ ...INPUT_STYLE, fontFamily: "'JetBrains Mono'" }}>
          {LANGUAGE_OPTIONS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {/* Appearance */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}>{t(lang, 'appearance')}</h3>
        <label style={LABEL_STYLE as any}>
          <input type="checkbox" checked={settings.darkMode} onChange={(e) => updateSetting('darkMode', e.target.checked)} style={{ accentColor: '#a78bfa' }} />
          {t(lang, 'darkMode')}
        </label>
        <label style={LABEL_STYLE as any}>
          <input type="checkbox" checked={settings.colorBlindMode} onChange={(e) => updateSetting('colorBlindMode', e.target.checked)} style={{ accentColor: '#a78bfa' }} />
          {t(lang, 'colorBlindMode')}
        </label>
        <label style={LABEL_STYLE as any}>
          <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => updateSetting('reducedMotion', e.target.checked)} style={{ accentColor: '#a78bfa' }} />
          {t(lang, 'reducedMotion')}
        </label>
      </div>

      {/* Ghost Bar */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}>{t(lang, 'productivityGhost')} <span style={{ fontSize: 12, color: '#64748b' }}>({t(lang, 'comingSoon')})</span></h3>
        <label style={LABEL_STYLE as any}>
          <input type="checkbox" checked={settings.ghostBarEnabled} onChange={(e) => updateSetting('ghostBarEnabled', e.target.checked)} style={{ accentColor: '#a78bfa' }} />
          {t(lang, 'enableGhostBar')}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <span style={{ fontSize: 14, color: '#94a3b8' }}>{t(lang, 'position')}:</span>
          <select value={settings.ghostBarPosition} onChange={(e) => updateSetting('ghostBarPosition', e.target.value as any)}
            style={{ ...INPUT_STYLE, minWidth: 160, fontFamily: "'JetBrains Mono'" }}>
            {GHOST_POSITIONS.map((p) => <option key={p.value} value={p.value}>{t(lang, p.labelKey)}</option>)}
          </select>
        </div>
      </div>

      {/* Google Calendar */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}>{t(lang, 'googleCalendar')}</h3>
        {settings.calendarAuthorized ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: '#34d399' }}>✓ {t(lang, 'connected')}</span>
            <button onClick={() => { updateSetting('calendarAuthorized', false); showStatus('Calendar access revoked.'); }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #f87171', color: '#f87171', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
              {t(lang, 'revokeAccess')}
            </button>
          </div>
        ) : (
          <button onClick={() => { updateSetting('calendarAuthorized', true); showStatus('Google Calendar authorized.'); }}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#a78bfa', color: '#0A0B1A', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
            {t(lang, 'authorizeGoogleCalendar')}
          </button>
        )}
      </div>

      {/* Data Management */}
      <div style={CARD}>
        <h3 style={SECTION_TITLE}>{t(lang, 'dataManagement')}</h3>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16 }}>{t(lang, 'dataLocalMessage')}</p>
        {deleteConfirm ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#f87171', fontWeight: 600, fontSize: 14 }}>Are you sure? This cannot be undone.</span>
            <button onClick={() => { setDeleteConfirm(false); showStatus('All data deleted.'); }}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#f87171', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
              {t(lang, 'confirmDelete')}
            </button>
            <button onClick={() => setDeleteConfirm(false)}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #494552', background: 'none', color: '#e6e0ea', cursor: 'pointer', fontSize: 12 }}>
              {t(lang, 'cancel')}
            </button>
          </div>
        ) : (
          <button onClick={() => setDeleteConfirm(true)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #f87171', color: '#f87171', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
            {t(lang, 'deleteAllData')}
          </button>
        )}
      </div>
    </div>
  );
}
