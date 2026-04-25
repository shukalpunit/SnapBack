/**
 * SnapBack — Root React component with tab navigation.
 */

import React, { useState } from 'react';
import DashboardPage from './pages/DashboardPage.js';
import HeatMapPage from './pages/HeatMapPage.js';

type Tab = 'dashboard' | 'heatmap' | 'tasks' | 'settings';

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [colorBlindMode] = useState(false); // will be wired to settings in Task 15

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>SnapBack</h1>
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
              borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              textTransform: 'capitalize',
            }}
          >
            {tab === 'heatmap' ? 'Heat Map' : tab}
          </button>
        ))}
      </nav>

      <main role="tabpanel">
        {activeTab === 'dashboard' && <DashboardPage colorBlindMode={colorBlindMode} />}
        {activeTab === 'heatmap' && <HeatMapPage colorBlindMode={colorBlindMode} />}
        {activeTab === 'tasks' && <div><h2>Tasks</h2><p>Coming in Task 14…</p></div>}
        {activeTab === 'settings' && <div><h2>Settings</h2><p>Coming in Task 15…</p></div>}
      </main>
    </div>
  );
}
