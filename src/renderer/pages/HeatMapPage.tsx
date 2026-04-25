/**
 * HeatMapPage — Color-coded 96-cell time grid with i18n support.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getIPC, type HeatMapCell, type TooltipData } from '../ipc.js';
import { getClassificationIndicator, type ClassificationIndicator } from '../utils/colorBlind.js';
import { t, type Language } from '../i18n/translations.js';

interface HeatMapPageProps {
  colorBlindMode?: boolean;
  lang?: Language;
}

function formatTime(cellIndex: number): string {
  const totalMinutes = cellIndex * 15;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export default function HeatMapPage({ colorBlindMode = false, lang = 'en' }: HeatMapPageProps): React.ReactElement {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cells, setCells] = useState<HeatMapCell[]>([]);
  const [tooltip, setTooltip] = useState<{ cellIndex: number; data: TooltipData } | null>(null);

  useEffect(() => {
    getIPC().getHeatMapCells(date).then(setCells);
    setTooltip(null);
  }, [date]);

  const handleCellClick = useCallback(async (cellIndex: number) => {
    const data = await getIPC().getHeatMapTooltip(cellIndex, date);
    setTooltip(data ? { cellIndex, data } : null);
  }, [date]);

  const navigateDay = useCallback((offset: number) => {
    setDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    });
  }, []);

  return (
    <div className="heatmap-page" role="main" aria-label={t('heatMapTitle', lang)}>
      <div className="heatmap-nav" role="navigation" aria-label={t('heatMapTitle', lang)}>
        <button onClick={() => navigateDay(-1)} aria-label={t('prevDay', lang)}>{t('prevDay', lang)}</button>
        <span className="heatmap-date">{date}</span>
        <button onClick={() => navigateDay(1)} aria-label={t('nextDay', lang)}>{t('nextDay', lang)}</button>
      </div>

      <div className="heatmap-grid" role="grid" aria-label={t('heatMapTitle', lang)}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: '2px' }}>
        {cells.map((cell) => {
          let indicator: ClassificationIndicator | null = null;
          let bgColor = '#e5e7eb';
          if (cell.classification) {
            indicator = getClassificationIndicator(cell.classification, colorBlindMode);
            bgColor = indicator.color;
          }
          const isSelected = tooltip?.cellIndex === cell.cellIndex;
          return (
            <div key={cell.cellIndex} role="gridcell" tabIndex={0}
              aria-label={`${formatTime(cell.cellIndex)} — ${cell.classification ?? t('noData', lang)}`}
              style={{
                backgroundColor: bgColor, minHeight: '24px', borderRadius: '3px',
                cursor: cell.hasData ? 'pointer' : 'default',
                border: isSelected ? '2px solid #1e293b' : '1px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
              }}
              onClick={() => cell.hasData && handleCellClick(cell.cellIndex)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && cell.hasData && handleCellClick(cell.cellIndex)}
            >
              {colorBlindMode && indicator?.icon ? indicator.icon : ''}
            </div>
          );
        })}
      </div>

      {tooltip && (
        <div className="heatmap-tooltip" role="tooltip" aria-live="polite"
          style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
          <strong>{formatTime(tooltip.cellIndex)}</strong>
          <div>{t('app', lang)}: {tooltip.data.appName}</div>
          <div>{t('classification', lang)}: {tooltip.data.classification.replace(/_/g, ' ')}</div>
          <div>{t('duration', lang)}: {formatDuration(tooltip.data.durationMs)}</div>
        </div>
      )}
    </div>
  );
}
