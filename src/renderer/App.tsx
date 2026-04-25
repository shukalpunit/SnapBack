/**
 * SnapBack — Root React component with tab navigation, i18n, and persisted settings.
 */

import React, { useState, useCallback } from 'react';
import DashboardPage from './pages/DashboardPage.js';
import HeatMapPage from './pages/HeatMapPage.js';
import TasksPage from './pages/TasksPage.js';
import SettingsPage from './pages/SettingsPage.js';
import type { AppSettings } from './ipc.js';
import { t, type Language } from './i18n/translations.js';
import { loadSettings, saveSettings } from './utils/settingsStore.js';

type Tab = 'dashboard' | 'heatmap' | 'tasks' | 'settings';

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const lang = (settings.language || 'en') as Language;

  const handleSettingsChange = useCallback((updated: AppSettings) => {
    setSettings(updated);
    saveSettings(updated);
  }, []);

  const tabLabels: Record<Tab, string> = {
    dashboard: t('tabDashboard', lang),
    heatmap: t('tabHeatMap', lang),
    tasks: t('tabTasks', lang),
    settings: t('tabSettings', lang),
  };

  const rootStyle: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif',
    padding: '1rem',
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: settings.darkMode ? '#0f172a' : '#ffffff',
    color: settings.darkMode ? '#e2e8f0' : '#1e293b',
    minHeight: '100vh',
    transition: settings.reducedMotion ? 'none' : 'background-color 0.3s, color 0.3s',
  };

  return (
    <div style={rootStyle}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>{t('appName', lang)}</h1>
      </header>

      <nav role="tablist" aria-label="Main navigation" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['dashboard', 'heatmap', 'tasks', 'settings'] as Tab[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderBottom: activeTab === tab
                ? `2px solid ${settings.darkMode ? '#60a5fa' : '#2563eb'}`
                : '2px solid transparent',
              background: 'none',
              color: settings.darkMode ? '#e2e8f0' : '#1e293b',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              transition: settings.reducedMotion ? 'none' : 'border-color 0.2s',
            }}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </nav>

      <main role="tabpanel">
        {activeTab === 'dashboard' && <DashboardPage colorBlindMode={settings.colorBlindMode} lang={lang} />}
        {activeTab === 'heatmap' && <HeatMapPage colorBlindMode={settings.colorBlindMode} lang={lang} />}
        {activeTab === 'tasks' && <TasksPage lang={lang} />}
        {activeTab === 'settings' && <SettingsPage onSettingsChange={handleSettingsChange} currentSettings={settings} lang={lang} />}
      </main>
    </div>
  );
}
