/**
 * SnapBack — Root component with sidebar navigation matching the design system.
 */

import React, { useState, useCallback, useEffect } from 'react';
import DashboardPage from './pages/DashboardPage.js';
import HeatMapPage from './pages/HeatMapPage.js';
import TasksPage from './pages/TasksPage.js';
import SettingsPage from './pages/SettingsPage.js';
import CalendarPage from './pages/CalendarPage.js';
import type { AppSettings } from './ipc.js';
import { t, type Language } from './i18n/translations.js';
import { loadSettings, saveSettings } from './utils/settingsStore.js';
import { getLanguageTypography, langContainerProps, SKIP_NAV_LABELS, ACCESSIBLE_COLORS } from './utils/accessibility.js';

type Tab = 'dashboard' | 'heatmap' | 'tasks' | 'reports' | 'calendar' | 'settings';

const NAV_ITEMS: Array<{ tab: Tab; icon: string; labelKey: 'dashboard' | 'heatMap' | 'tasks' | 'reports' | 'calendar' | 'settings' }> = [
  { tab: 'dashboard', icon: 'grid_view', labelKey: 'dashboard' },
  { tab: 'heatmap', icon: 'layers', labelKey: 'heatMap' },
  { tab: 'tasks', icon: 'checklist', labelKey: 'tasks' },
  { tab: 'reports', icon: 'bar_chart', labelKey: 'reports' },
  { tab: 'calendar', icon: 'event', labelKey: 'calendar' },
  { tab: 'settings', icon: 'settings', labelKey: 'settings' },
];

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const lang = (settings.language || 'en') as Language;

  const handleSettingsChange = useCallback((updated: AppSettings) => {
    setSettings(updated);
    saveSettings(updated);
  }, []);

  const langTypo = getLanguageTypography(lang);
  const containerProps = langContainerProps(lang);

  // Update document lang attribute when language changes
  useEffect(() => {
    document.documentElement.lang = langTypo.htmlLang;
    document.documentElement.dir = langTypo.direction;
  }, [lang, langTypo]);

  return (
    <div {...containerProps} style={{ display: 'flex', minHeight: '100vh', fontFamily: langTypo.fontFamily }}>
      {/* Skip Navigation (WCAG 2.4.1) */}
      <a href="#main-content" style={{
        position: 'absolute', left: -9999, top: 'auto', width: 1, height: 1, overflow: 'hidden',
        zIndex: 100, padding: '12px 24px', background: '#a78bfa', color: '#0F1023',
        fontWeight: 700, fontSize: 14, borderRadius: 8, textDecoration: 'none',
      }} onFocus={(e) => { e.currentTarget.style.left = '50%'; e.currentTarget.style.transform = 'translateX(-50%)'; e.currentTarget.style.top = '8px'; e.currentTarget.style.width = 'auto'; e.currentTarget.style.height = 'auto'; }}
         onBlur={(e) => { e.currentTarget.style.left = '-9999px'; e.currentTarget.style.width = '1px'; e.currentTarget.style.height = '1px'; }}>
        {SKIP_NAV_LABELS[lang]}
      </a>
      {/* Sidebar */}
      <aside style={{
        position: 'fixed', left: 0, top: 0, height: '100vh', width: 240,
        borderRight: '1px solid #1B1D36', background: '#0A0B1A',
        boxShadow: '4px 0 24px rgba(0,0,0,0.5)', display: 'flex',
        flexDirection: 'column', justifyContent: 'space-between', padding: '32px 0', zIndex: 50,
      }}>
        <div>
          {/* Logo */}
          <div style={{ padding: '0 24px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img src="/SnapBack Logo.jpeg" alt="SnapBack" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div>
              <h1 style={{ fontFamily: "'JetBrains Mono'", fontSize: 20, fontWeight: 900, color: '#a78bfa', letterSpacing: '-0.05em', lineHeight: 1 }}>SnapBack</h1>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: 2 }}>{t(lang, 'flowStateActive')}</p>
            </div>
          </div>

          {/* Nav Items */}
          <nav>
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.tab;
              return (
                <a
                  key={item.tab}
                  href="#"
                  onClick={(e) => { e.preventDefault(); setActiveTab(item.tab); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px',
                    color: isActive ? '#a78bfa' : '#64748b',
                    background: isActive ? 'rgba(167,139,250,0.05)' : 'transparent',
                    borderLeft: isActive ? '2px solid #a78bfa' : '2px solid transparent',
                    boxShadow: isActive ? '0 0 15px rgba(167,139,250,0.1)' : 'none',
                    textDecoration: 'none', transition: 'all 0.2s', fontSize: 14, fontWeight: 500,
                  }}
                >
                  <span className="material-symbols-outlined" style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>{item.icon}</span>
                  <span>{t(lang, item.labelKey)}</span>
                </a>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div style={{ padding: '0 24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            background: 'rgba(27,29,54,0.5)', borderRadius: 12, border: '1px solid #1B1D36',
          }}>
            <span className="material-symbols-outlined" style={{ color: '#64748b' }}>lock</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8' }}>{t(lang, 'localOnly')}</span>
          </div>
        </div>
      </aside>

      {/* Top Bar */}
      <header style={{
        position: 'fixed', top: 0, right: 0, width: 'calc(100% - 240px)', height: 64, zIndex: 40,
        background: 'rgba(15,16,35,0.9)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid #1B1D36', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 32px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', background: '#0A0B1A', borderRadius: 8,
          border: '1px solid #1B1D36', padding: '6px 12px', width: 384,
        }}>
          <span className="material-symbols-outlined" style={{ color: '#64748b', fontSize: 14, marginRight: 8 }}>search</span>
          <input
            type="text"
            placeholder={t(lang, 'searchSystem')}
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              fontFamily: "'JetBrains Mono'", fontSize: 11, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: '#94a3b8', width: '100%',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span className="material-symbols-outlined" style={{ color: '#a78bfa', cursor: 'pointer' }}>bolt</span>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ color: '#94a3b8', cursor: 'pointer' }}>notifications</span>
            <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '2px solid #0F1023' }} />
          </div>
          <span className="material-symbols-outlined" style={{ color: '#94a3b8', cursor: 'pointer' }}>account_circle</span>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" role="main" style={{ marginLeft: 240, paddingTop: 64, minHeight: '100vh', padding: '80px 24px 24px 24px', width: 'calc(100% - 240px)' }}>
        {activeTab === 'dashboard' && <DashboardPage colorBlindMode={settings.colorBlindMode} lang={lang} />}
        {activeTab === 'heatmap' && <HeatMapPage colorBlindMode={settings.colorBlindMode} lang={lang} />}
        {activeTab === 'tasks' && <TasksPage lang={lang} />}
        {activeTab === 'reports' && (
          <div>
            <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: '0.05em', color: '#cebdff', textTransform: 'uppercase' }}>{t(lang, 'performanceAnalysis')}</span>
            <h2 style={{ fontFamily: 'Inter', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4 }}>{t(lang, 'weeklyReport')}</h2>
            <p style={{ color: '#64748b', marginTop: 16 }}>Weekly report view coming soon.</p>
          </div>
        )}
        {activeTab === 'calendar' && <CalendarPage lang={lang} />}
        {activeTab === 'settings' && <SettingsPage onSettingsChange={handleSettingsChange} currentSettings={settings} lang={lang} />}
      </main>
    </div>
  );
}
