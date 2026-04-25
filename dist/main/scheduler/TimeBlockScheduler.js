"use strict";
/**
 * TimeBlockScheduler — Aligns high-priority tasks with peak productivity hours.
 *
 * Analyzes the user's historical deep work patterns from the heat map data
 * to identify their most productive time slots, then generates time block
 * suggestions that pair the highest-priority incomplete tasks with those
 * peak hours, avoiding existing calendar events.
 *
 * All data stays local — suggestions are computed on-device from LocalStore data.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeBlockScheduler = void 0;
const node_crypto_1 = require("node:crypto");
// ─── Constants ───────────────────────────────────────────────────────────────
/** Number of historical days to analyze for productivity patterns. */
const ANALYSIS_WINDOW_DAYS = 14;
/** Default block duration in minutes. */
const DEFAULT_BLOCK_DURATION_MINUTES = 60;
/** Priority weights for task ordering. */
const PRIORITY_WEIGHT = {
    high: 3,
    medium: 2,
    low: 1,
};
/** Working hours range (inclusive). */
const WORK_HOURS_START = 7; // 7 AM
const WORK_HOURS_END = 21; // 9 PM
// ─── Helpers ─────────────────────────────────────────────────────────────────
function startOfDayMs(dateStr) {
    return new Date(dateStr + 'T00:00:00.000Z').getTime();
}
function daysAgo(n, refDate) {
    const d = refDate ? new Date(refDate) : new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}
function overlapMs(segStart, segEnd, windowStart, windowEnd) {
    return Math.max(Math.min(segEnd, windowEnd) - Math.max(segStart, windowStart), 0);
}
// ─── TimeBlockScheduler ──────────────────────────────────────────────────────
class TimeBlockScheduler {
    store;
    constructor(store) {
        this.store = store;
    }
    /**
     * Analyze the user's historical productivity by hour of day.
     * Returns 24 slots (one per hour) with average deep work minutes and a normalized score.
     */
    analyzeProductivityByHour(refDate) {
        const hourTotals = new Array(24).fill(0);
        let daysAnalyzed = 0;
        for (let d = 1; d <= ANALYSIS_WINDOW_DAYS; d++) {
            const date = daysAgo(d, refDate);
            const dayStart = startOfDayMs(date);
            const dayEnd = dayStart + 24 * 60 * 60 * 1000;
            const segments = this.store.querySegments(dayStart, dayEnd);
            if (segments.length === 0)
                continue;
            daysAnalyzed++;
            for (const seg of segments) {
                if (seg.classification !== 'deep_work')
                    continue;
                // Distribute deep work across the hours it spans
                for (let h = 0; h < 24; h++) {
                    const hourStart = dayStart + h * 60 * 60 * 1000;
                    const hourEnd = hourStart + 60 * 60 * 1000;
                    const overlap = overlapMs(seg.startTime, seg.endTime, hourStart, hourEnd);
                    if (overlap > 0) {
                        hourTotals[h] += overlap / 60_000; // convert to minutes
                    }
                }
            }
        }
        // Average across analyzed days
        const avgMinutes = hourTotals.map((total) => daysAnalyzed > 0 ? total / daysAnalyzed : 0);
        // Normalize to 0–1 score
        const maxAvg = Math.max(...avgMinutes, 1); // avoid division by zero
        return avgMinutes.map((avg, hour) => ({
            hour,
            avgDeepWorkMinutes: Math.round(avg * 10) / 10,
            score: Math.round((avg / maxAvg) * 100) / 100,
        }));
    }
    /**
     * Get the user's peak productivity hours, sorted by score descending.
     * Only includes hours within the working hours range.
     */
    getPeakHours(refDate, minScore = 0.3) {
        return this.analyzeProductivityByHour(refDate)
            .filter((s) => s.hour >= WORK_HOURS_START && s.hour < WORK_HOURS_END)
            .filter((s) => s.score >= minScore)
            .sort((a, b) => b.score - a.score);
    }
    /**
     * Generate time block suggestions for today's incomplete tasks.
     * Pairs highest-priority tasks with peak productivity hours,
     * avoiding existing calendar events.
     */
    generateSuggestions(targetDate, blockDurationMinutes = DEFAULT_BLOCK_DURATION_MINUTES, refDate) {
        const date = targetDate ?? new Date().toISOString().slice(0, 10);
        const dayStart = startOfDayMs(date);
        // Get incomplete tasks sorted by priority (high first), then by order
        const allTasks = this.store.queryTasks();
        const incompleteTasks = allTasks
            .filter((t) => !t.completed)
            .sort((a, b) => {
            const pw = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
            if (pw !== 0)
                return pw;
            return a.order - b.order;
        });
        if (incompleteTasks.length === 0)
            return [];
        // Get peak hours
        const peakHours = this.getPeakHours(refDate);
        if (peakHours.length === 0) {
            // No historical data — fall back to default productive hours (9, 10, 11, 14, 15)
            return this.generateDefaultSuggestions(incompleteTasks, date, dayStart, blockDurationMinutes);
        }
        // Get existing calendar events for the target date
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        const existingEvents = this.store.queryCalendarEvents(dayStart, dayEnd);
        // Assign tasks to peak hours, avoiding conflicts
        const suggestions = [];
        const usedHours = new Set();
        for (const task of incompleteTasks) {
            if (suggestions.length >= peakHours.length)
                break;
            // Find the best available slot
            for (const slot of peakHours) {
                if (usedHours.has(slot.hour))
                    continue;
                const blockStart = dayStart + slot.hour * 60 * 60 * 1000;
                const blockEnd = blockStart + blockDurationMinutes * 60 * 1000;
                // Check for calendar conflicts
                const hasConflict = existingEvents.some((evt) => overlapMs(evt.startTime, evt.endTime, blockStart, blockEnd) > 0);
                if (hasConflict)
                    continue;
                usedHours.add(slot.hour);
                suggestions.push({
                    id: (0, node_crypto_1.randomUUID)(),
                    taskId: task.id,
                    taskTitle: task.title,
                    taskPriority: task.priority,
                    startTime: blockStart,
                    endTime: blockEnd,
                    slotScore: slot.score,
                    reason: `Your deep work peaks at ${formatHour(slot.hour)} — schedule "${task.title}" here for maximum focus.`,
                });
                break;
            }
        }
        return suggestions;
    }
    /**
     * Convert suggestions into calendar time blocks ready to be pushed to Google Calendar.
     */
    toCalendarBlocks(suggestions) {
        return suggestions.map((s) => ({
            title: `⚡ ${s.taskTitle}`,
            startTime: s.startTime,
            endTime: s.endTime,
            description: `SnapBack Time Block — ${s.taskPriority} priority\n${s.reason}`,
        }));
    }
    // ─── Private ─────────────────────────────────────────────────────────────
    generateDefaultSuggestions(tasks, date, dayStart, blockDurationMinutes) {
        const defaultHours = [9, 10, 11, 14, 15]; // common productive hours
        const suggestions = [];
        for (let i = 0; i < Math.min(tasks.length, defaultHours.length); i++) {
            const task = tasks[i];
            const hour = defaultHours[i];
            const blockStart = dayStart + hour * 60 * 60 * 1000;
            const blockEnd = blockStart + blockDurationMinutes * 60 * 1000;
            suggestions.push({
                id: (0, node_crypto_1.randomUUID)(),
                taskId: task.id,
                taskTitle: task.title,
                taskPriority: task.priority,
                startTime: blockStart,
                endTime: blockEnd,
                slotScore: 0.5, // default score
                reason: `No historical data yet — ${formatHour(hour)} is a commonly productive hour.`,
            });
        }
        return suggestions;
    }
}
exports.TimeBlockScheduler = TimeBlockScheduler;
// ─── Formatting ──────────────────────────────────────────────────────────────
function formatHour(hour) {
    if (hour === 0)
        return '12 AM';
    if (hour < 12)
        return `${hour} AM`;
    if (hour === 12)
        return '12 PM';
    return `${hour - 12} PM`;
}
