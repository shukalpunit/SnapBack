"use strict";
/**
 * HeatMapService — 96-cell time grid with dominant classification per block.
 *
 * Produces exactly 96 cells per day (one per 15-minute block), each colored
 * by the classification with the greatest total duration in that window.
 * Provides tooltip data for cells containing at least one segment.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeatMapService = void 0;
// ─── Constants ───────────────────────────────────────────────────────────────
const CELLS_PER_DAY = 96;
const CELL_DURATION_MS = 15 * 60 * 1000; // 15 minutes
// ─── Helpers ─────────────────────────────────────────────────────────────────
function startOfDayMs(dateStr) {
    return new Date(dateStr + 'T00:00:00.000Z').getTime();
}
function segmentDuration(seg) {
    return Math.max(seg.endTime - seg.startTime, 0);
}
/**
 * Compute how much of a segment overlaps with a given time window.
 */
function overlapMs(segStart, segEnd, windowStart, windowEnd) {
    const start = Math.max(segStart, windowStart);
    const end = Math.min(segEnd, windowEnd);
    return Math.max(end - start, 0);
}
// ─── HeatMapService ──────────────────────────────────────────────────────────
class HeatMapService {
    store;
    constructor(store) {
        this.store = store;
    }
    /**
     * Produce exactly 96 cells for a given day. Each cell's classification
     * is the one with the greatest total duration within that 15-minute window.
     * Validates: Requirements 3.1, 3.2 (Property 7: Heat Map Grid Completeness)
     */
    getHeatMapCells(date) {
        const dayStart = startOfDayMs(date);
        const dayEnd = dayStart + CELLS_PER_DAY * CELL_DURATION_MS;
        // Query all segments that could overlap this day
        const segments = this.store.querySegments(dayStart, dayEnd);
        const cells = [];
        for (let i = 0; i < CELLS_PER_DAY; i++) {
            const windowStart = dayStart + i * CELL_DURATION_MS;
            const windowEnd = windowStart + CELL_DURATION_MS;
            // Accumulate duration per classification in this window
            let deepMs = 0;
            let shallowMs = 0;
            let distractionMs = 0;
            let hasData = false;
            for (const seg of segments) {
                const overlap = overlapMs(seg.startTime, seg.endTime, windowStart, windowEnd);
                if (overlap > 0) {
                    hasData = true;
                    switch (seg.classification) {
                        case 'deep_work':
                            deepMs += overlap;
                            break;
                        case 'shallow_work':
                            shallowMs += overlap;
                            break;
                        case 'distraction_loop':
                            distractionMs += overlap;
                            break;
                    }
                }
            }
            let classification = null;
            if (hasData) {
                if (deepMs >= shallowMs && deepMs >= distractionMs) {
                    classification = 'deep_work';
                }
                else if (shallowMs >= distractionMs) {
                    classification = 'shallow_work';
                }
                else {
                    classification = 'distraction_loop';
                }
            }
            cells.push({
                cellIndex: i,
                startTime: windowStart,
                endTime: windowEnd,
                classification,
                hasData,
            });
        }
        return cells;
    }
    /**
     * Get tooltip data for a specific cell. Returns the dominant app,
     * its classification, and duration. All fields non-null, duration > 0
     * for cells with data.
     * Validates: Requirements 3.3 (Property 8: Heat Map Tooltip Data Completeness)
     */
    getTooltipData(cellIndex, date) {
        if (cellIndex < 0 || cellIndex >= CELLS_PER_DAY)
            return null;
        const dayStart = startOfDayMs(date);
        const windowStart = dayStart + cellIndex * CELL_DURATION_MS;
        const windowEnd = windowStart + CELL_DURATION_MS;
        const dayEnd = dayStart + CELLS_PER_DAY * CELL_DURATION_MS;
        const segments = this.store.querySegments(dayStart, dayEnd);
        // Find the app with the most overlap in this window
        const appDurations = new Map();
        for (const seg of segments) {
            const overlap = overlapMs(seg.startTime, seg.endTime, windowStart, windowEnd);
            if (overlap > 0) {
                const existing = appDurations.get(seg.appName);
                if (existing) {
                    existing.durationMs += overlap;
                }
                else {
                    appDurations.set(seg.appName, {
                        durationMs: overlap,
                        classification: seg.classification,
                    });
                }
            }
        }
        if (appDurations.size === 0)
            return null;
        // Find dominant app
        let bestApp = '';
        let bestDuration = 0;
        let bestClassification = 'shallow_work';
        for (const [appName, data] of appDurations) {
            if (data.durationMs > bestDuration) {
                bestApp = appName;
                bestDuration = data.durationMs;
                bestClassification = data.classification;
            }
        }
        return {
            appName: bestApp,
            classification: bestClassification,
            durationMs: bestDuration,
        };
    }
}
exports.HeatMapService = HeatMapService;
