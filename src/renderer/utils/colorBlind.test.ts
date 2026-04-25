// Feature: snapback-productivity-suite, Property 9: Color Blind Mode Indicator Distinctness
// Validates: Requirements 3.5, 10.3

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  getClassificationIndicator,
  DEFAULT_COLORS,
  COLOR_BLIND_COLORS,
  ICON_PATTERNS,
} from './colorBlind.js';
import type { Classification } from '../ipc.js';

const arbClassification = fc.oneof(
  fc.constant<Classification>('deep_work'),
  fc.constant<Classification>('shallow_work'),
  fc.constant<Classification>('distraction_loop')
);

describe('Property 9: Color Blind Mode Indicator Distinctness', () => {
  it('in color blind mode, indicator has non-null color different from default AND non-null icon', () => {
    fc.assert(
      fc.property(
        arbClassification,
        (classification) => {
          const indicator = getClassificationIndicator(classification, true);

          // Color must be non-null and non-empty
          if (!indicator.color || indicator.color.length === 0) return false;

          // Color must differ from the default palette
          if (indicator.color === DEFAULT_COLORS[classification]) return false;

          // Icon must be non-null and non-empty
          if (!indicator.icon || indicator.icon.length === 0) return false;

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all three color blind colors are distinct from each other', () => {
    const colors = Object.values(COLOR_BLIND_COLORS);
    const unique = new Set(colors);
    expect(unique.size).toBe(3);
  });

  it('all three icon patterns are distinct from each other', () => {
    const icons = Object.values(ICON_PATTERNS);
    const unique = new Set(icons);
    expect(unique.size).toBe(3);
  });

  it('in normal mode, indicator has default color and no icon', () => {
    fc.assert(
      fc.property(
        arbClassification,
        (classification) => {
          const indicator = getClassificationIndicator(classification, false);
          return (
            indicator.color === DEFAULT_COLORS[classification] &&
            indicator.icon === ''
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
