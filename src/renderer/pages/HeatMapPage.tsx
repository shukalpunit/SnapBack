/**
 * HeatMapPage — Weekly focus intensity grid matching the design system.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getIPC, type HeatMapCell, type TooltipData } from '../ipc.js';
import { getClassificationIndicator } from '../utils/colorBlind.js';
import { t, type Language } from '../i18n/translations.js';

interface HeatMapPageProps { colorBlindMode?: boolean; lang?: Language; }

const CARD = { background: '#1B1D36', border: '1px solid #2B2930', borderRadius: 12, padding: 24 };
const LABEL = { fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', color: '#64748b', textTransform: 'uppercase' as const };

const COLORS = { deep_work: '#2DD4BF', shallow_work: '#FBBF24', distraction_loop: '#F87171', inactive: '#0F1023' };

export default function HeatMapPage({ colorBlindMode = false, lang = 'en' }: HeatMapPageProps): React.ReactElement {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cells, setCells] = useState<HeatMapCell[]>([]);
  const [tooltip, setTooltip] = useState<{ cellIndex: number; data: TooltipData } | null>(null);

  useEffect(() => {
    const refresh = () => getIPC().getHeatMapCells(date).then(setCells);
    refresh();
    setTooltip(null);
    // Auto-refresh every 10 seconds
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [date]);

  const handleCellClick = useCallback(async (cellIndex: number) => {
    const data = await getIPC().getHeatMapTooltip(cellIndex, date);
    setTooltip(data ? { cellIndex, data } : null);
  }, [date]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span style={{ ...LABEL, color: '#cebdff', display: 'block', marginBottom: 8 }}>{t(lang, 'visualAnalytics')}</span>
          <h2 style={{ fontFamily: 'Inter', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}>{t(lang, 'weeklyFocusIntensity')}</h2>
        </div>
        {/* Legend */}
        <div style={{ ...CARD, padding: 16, display: 'flex', alignItems: 'center', gap: 24 }}>
          {[
            { color: COLORS.deep_work, label: t(lang, 'deepWork') },
            { color: COLORS.shallow_work, label: t(lang, 'shallowWork') },
            { color: COLORS.distraction_loop, label: t(lang, 'distraction') },
            { color: COLORS.inactive, label: t(lang, 'inactive'), border: true },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color, border: item.border ? '1px solid #2B2930' : 'none' }} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: '#94a3b8', textTransform: 'uppercase' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setDate((d) => { const dt = new Date(d); dt.setDate(dt.getDate() - 1); return dt.toISOString().slice(0, 10); })}
          style={{ background: '#1B1D36', border: '1px solid #2B2930', borderRadius: 8, padding: '8px 16px', color: '#e6e0ea', cursor: 'pointer', fontFamily: "'JetBrains Mono'", fontSize: 12 }}>
          ← Prev
        </button>
        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 14, color: '#cebdff' }}>{date}</span>
        <button onClick={() => setDate((d) => { const dt = new Date(d); dt.setDate(dt.getDate() + 1); return dt.toISOString().slice(0, 10); })}
          style={{ background: '#1B1D36', border: '1px solid #2B2930', borderRadius: 8, padding: '8px 16px', color: '#e6e0ea', cursor: 'pointer', fontFamily: "'JetBrains Mono'", fontSize: 12 }}>
          Next →
        </button>
      </div>

      {/* Heat Map Grid */}
      <div style={{ ...CARD, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2 }}>
          {/* Hour labels */}
          {Array.from({ length: 24 }, (_, i) => (
            <div key={`h-${i}`} style={{ textAlign: 'center', fontFamily: "'JetBrains Mono'", fontSize: 9, color: '#64748b', paddingBottom: 4 }}>
              {i.toString().padStart(2, '0')}
            </div>
          ))}
          {/* Cells */}
          {cells.map((cell) => {
            const bg = cell.classification ? COLORS[cell.classification] : COLORS.inactive;
            const indicator = cell.classification ? getClassificationIndicator(cell.classification, colorBlindMode) : null;
            const isSelected = tooltip?.cellIndex === cell.cellIndex;
            return (
              <div
                key={cell.cellIndex}
                onClick={() => cell.hasData && handleCellClick(cell.cellIndex)}
                tabIndex={cell.hasData ? 0 : -1}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && cell.hasData && handleCellClick(cell.cellIndex)}
                role="gridcell"
                aria-label={`${Math.floor(cell.cellIndex / 4)}:${(cell.cellIndex % 4) * 15} — ${cell.classification ?? 'inactive'}`}
                style={{
                  background: colorBlindMode && indicator ? indicator.color : bg,
                  minHeight: 24, borderRadius: 2, cursor: cell.hasData ? 'crosshair' : 'default',
                  border: isSelected ? '2px solid #cebdff' : cell.hasData ? 'none' : '1px solid #1B1D36',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, opacity: cell.classification ? 0.7 : 0.3,
                  transition: 'opacity 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; (e.target as HTMLElement).style.boxShadow = '0 0 15px rgba(167,139,250,0.4)'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = cell.classification ? '0.7' : '0.3'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
              >
                {colorBlindMode && indicator?.icon ? indicator.icon : ''}
              </div>
            );
          })}
        </div>

        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: -96, right: -96, width: 256, height: 256, background: 'rgba(167,139,250,0.05)', filter: 'blur(120px)', pointerEvents: 'none' }} />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ ...CARD, padding: 16, maxWidth: 300 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ ...LABEL, color: '#cebdff', fontSize: 10 }}>{tooltip.data.classification.replace(/_/g, ' ').toUpperCase()}</span>
            <span style={{ fontFamily: "'JetBrains Mono'", fontSize: 10, color: '#e6e0ea' }}>
              {Math.floor(tooltip.cellIndex / 4).toString().padStart(2, '0')}:{((tooltip.cellIndex % 4) * 15).toString().padStart(2, '0')}
            </span>
          </div>
          <p style={{ fontSize: 14, fontWeight: 700 }}>{tooltip.data.appName}</p>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>{Math.round(tooltip.data.durationMs / 60000)}m</p>
        </div>
      )}
    </div>
  );
}
