/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { RESOLUTION_RULE_IDS } from '../../../common/domain/resolution_rules/constants';
import { migrate } from './migrate';
import type { AutomatedResolutionState } from './types';

const EMAIL_RULE = RESOLUTION_RULE_IDS.EMAIL_EXACT_MATCH;

// Scenarios adapted from the watermark-migration spike
// (epics/entity-resolution/poc-3-watermark-migration). The legacy production
// shape is the flat single-rule state; the email rule carries that watermark.
const FIXTURES: Record<string, unknown> = {
  'clean-upgrade': {
    lastProcessedTimestamp: '2026-05-30T10:00:00Z',
    lastRun: { resolutionsCreated: 42, skippedAmbiguousBuckets: 3 },
  },
  'already-migrated': {
    rules: {
      [EMAIL_RULE]: {
        lastProcessedTimestamp: '2026-05-31T08:30:00Z',
        lastRun: { resolutionsCreated: 7, skippedAmbiguousBuckets: 1 },
      },
      // A rule id this version may not implement yet — must be preserved untouched.
      some_future_rule: {
        lastProcessedTimestamp: '2026-06-01T09:00:00Z',
        lastRun: { resolutionsCreated: 2, skippedAmbiguousBuckets: 0 },
      },
    },
  },
  empty: {},
  'extra-fields': {
    lastProcessedTimestamp: '2026-05-29T14:15:00Z',
    lastRun: { resolutionsCreated: 13, skippedAmbiguousBuckets: 4, futureMetric: 99 },
    debugTraceId: 'upgrade-debug-1',
    futureMigrationHint: { writtenBy: 'future-version' },
  },
  'malformed-timestamp': {
    lastProcessedTimestamp: 'garbage',
    lastRun: { resolutionsCreated: 9, skippedAmbiguousBuckets: 2 },
  },
  partial: {
    lastProcessedTimestamp: '2026-05-30T10:00:00Z',
    lastRun: { resolutionsCreated: 42, skippedAmbiguousBuckets: 3 },
    rules: {
      [EMAIL_RULE]: {
        lastProcessedTimestamp: '2026-06-02T12:00:00Z',
        lastRun: { resolutionsCreated: 5, skippedAmbiguousBuckets: 0 },
      },
    },
  },
};

const expectNoLegacyTopLevelFields = (state: AutomatedResolutionState): void => {
  expect(Object.hasOwn(state, 'lastProcessedTimestamp')).toBe(false);
  expect(Object.hasOwn(state, 'lastRun')).toBe(false);
};

describe('automated-resolution state migration', () => {
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    logger = loggerMock.create();
  });

  it('SCENARIO 1 - clean upgrade moves the legacy watermark into the email rule', () => {
    const output = migrate(FIXTURES['clean-upgrade'], logger);

    expect(output.rules[EMAIL_RULE].lastProcessedTimestamp).toBe('2026-05-30T10:00:00Z');
    expect(output.rules[EMAIL_RULE].lastRun).toEqual({
      resolutionsCreated: 42,
      skippedAmbiguousBuckets: 3,
    });
    // No other rules are seeded — they backfill on first run.
    expect(Object.keys(output.rules)).toEqual([EMAIL_RULE]);
    expectNoLegacyTopLevelFields(output);
  });

  it('SCENARIO 2 - already-migrated state is a no-op and preserves unknown rule ids', () => {
    const input = FIXTURES['already-migrated'];
    const output = migrate(input, logger);

    expect(output).toEqual(input);
    expect(output.rules.some_future_rule).toEqual({
      lastProcessedTimestamp: '2026-06-01T09:00:00Z',
      lastRun: { resolutionsCreated: 2, skippedAmbiguousBuckets: 0 },
    });
  });

  it('SCENARIO 3 - empty / null / undefined state yields an empty rules map', () => {
    for (const input of [FIXTURES.empty, null, undefined]) {
      const output = migrate(input, logger);

      expect(output.rules).toEqual({});
      expectNoLegacyTopLevelFields(output);
    }
  });

  it('SCENARIO 4 - partial state prefers the already-migrated email rule entry', () => {
    const output = migrate(FIXTURES.partial, logger);

    expect(output.rules[EMAIL_RULE].lastProcessedTimestamp).toBe('2026-06-02T12:00:00Z');
    expect(output.rules[EMAIL_RULE].lastRun).toEqual({
      resolutionsCreated: 5,
      skippedAmbiguousBuckets: 0,
    });
    expectNoLegacyTopLevelFields(output);
  });

  it('SCENARIO 5 - malformed timestamp degrades to null without throwing', () => {
    const output = migrate(FIXTURES['malformed-timestamp'], logger);

    expect(output.rules[EMAIL_RULE].lastProcessedTimestamp).toBeNull();
    expect(output.rules[EMAIL_RULE].lastRun).toEqual({
      resolutionsCreated: 9,
      skippedAmbiguousBuckets: 2,
    });
    expectNoLegacyTopLevelFields(output);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('malformed'));
  });

  it('SCENARIO 6 - drops unrecognized top-level and lastRun fields', () => {
    const output = migrate(FIXTURES['extra-fields'], logger);

    // The watermark and known stats migrate; extraneous fields are not carried over.
    expect(output.rules[EMAIL_RULE]).toEqual({
      lastProcessedTimestamp: '2026-05-29T14:15:00Z',
      lastRun: { resolutionsCreated: 13, skippedAmbiguousBuckets: 4 },
    });
    expect(Object.keys(output)).toEqual(['rules']);
  });

  it('is idempotent across every fixture: migrate(migrate(s)) === migrate(s)', () => {
    for (const fixture of Object.values(FIXTURES)) {
      const once = migrate(fixture, logger);
      const twice = migrate(once, logger);
      expect(twice).toEqual(once);
      // Guard against key-ordering drift across passes.
      expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    }
  });

  it('never throws on arbitrary malformed input', () => {
    const inputs: unknown[] = [
      42,
      'a string',
      [],
      [{ lastProcessedTimestamp: 'x' }],
      { rules: 'not-an-object' },
      { rules: { [EMAIL_RULE]: 'not-an-object' } },
      { lastRun: { resolutionsCreated: 'nope', skippedAmbiguousBuckets: 1 } },
    ];

    for (const input of inputs) {
      expect(() => migrate(input, logger)).not.toThrow();
    }
  });

  it('upgrade-safety: a production-shape (9.4.x) single-rule state preserves the watermark', () => {
    // Mimics the persisted `state` field of the `automated-resolution`
    // task-manager document as of the latest released Kibana.
    const productionState = {
      lastProcessedTimestamp: '2026-04-15T07:22:31.512Z',
      lastRun: { resolutionsCreated: 128, skippedAmbiguousBuckets: 6 },
    };

    const output = migrate(productionState, logger);

    expect(output.rules[EMAIL_RULE].lastProcessedTimestamp).toBe(
      productionState.lastProcessedTimestamp
    );
    expect(output.rules[EMAIL_RULE].lastRun).toEqual(productionState.lastRun);
    expectNoLegacyTopLevelFields(output);
  });
});
