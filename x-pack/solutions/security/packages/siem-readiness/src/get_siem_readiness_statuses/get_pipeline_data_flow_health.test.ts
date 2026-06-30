/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PipelineStats } from '../types';
import { VOLUME_DROP_CRITICAL_PCT, VOLUME_DROP_WARNING_PCT } from '../constants';
import { getContinuityDataFlowHealth } from './get_pipeline_data_flow_health';

const makePipeline = (overrides: Partial<PipelineStats> = {}): PipelineStats => ({
  name: 'test-pipeline',
  indices: ['logs-test-default'],
  docsCount: 1000,
  failedDocsCount: 0,
  statsAvailable: true,
  isSilent: false,
  silenceMs: null,
  volumeDropPct: null,
  lastEventMs: null,
  lastFullDayDocs: null,
  baseline7dAvg: null,
  ...overrides,
});

describe('getContinuityDataFlowHealth', () => {
  describe('healthy baseline', () => {
    it('returns healthy when not silent and no volume drop', () => {
      expect(getContinuityDataFlowHealth(makePipeline({ volumeDropPct: 0 }))).toBe('healthy');
    });

    it('returns healthy when volumeDropPct is null (insufficient history)', () => {
      expect(getContinuityDataFlowHealth(makePipeline({ volumeDropPct: null }))).toBe('healthy');
    });

    it('returns healthy when volumeDropPct is below warning threshold', () => {
      expect(
        getContinuityDataFlowHealth(makePipeline({ volumeDropPct: VOLUME_DROP_WARNING_PCT - 1 }))
      ).toBe('healthy');
    });
  });

  describe('volume_drop_warning', () => {
    it('returns volume_drop_warning at exactly the warning threshold', () => {
      expect(
        getContinuityDataFlowHealth(makePipeline({ volumeDropPct: VOLUME_DROP_WARNING_PCT }))
      ).toBe('volume_drop_warning');
    });

    it('returns volume_drop_warning when above warning but below critical', () => {
      expect(
        getContinuityDataFlowHealth(makePipeline({ volumeDropPct: VOLUME_DROP_CRITICAL_PCT - 1 }))
      ).toBe('volume_drop_warning');
    });
  });

  describe('volume_drop_critical', () => {
    it('returns volume_drop_critical at exactly the critical threshold', () => {
      expect(
        getContinuityDataFlowHealth(makePipeline({ volumeDropPct: VOLUME_DROP_CRITICAL_PCT }))
      ).toBe('volume_drop_critical');
    });

    it('returns volume_drop_critical for a 100% drop when not silent', () => {
      // Parity: a non-silent pipeline with 100% drop is volume_drop_critical, not silent.
      // This ensures the two checks remain independent and isSilent is required for 'silent'.
      expect(
        getContinuityDataFlowHealth(makePipeline({ isSilent: false, volumeDropPct: 100 }))
      ).toBe('volume_drop_critical');
    });
  });

  describe('silent (highest precedence)', () => {
    it('returns silent when isSilent is true', () => {
      expect(getContinuityDataFlowHealth(makePipeline({ isSilent: true }))).toBe('silent');
    });

    it('returns silent even when volumeDropPct is 100 — silence wins', () => {
      // Parity with get_continuity.ts: when both conditions apply, silence is the primary signal
      // and the finding includes volume context rather than emitting two separate findings.
      expect(
        getContinuityDataFlowHealth(makePipeline({ isSilent: true, volumeDropPct: 100 }))
      ).toBe('silent');
    });

    it('returns silent even when volumeDropPct is at the critical threshold', () => {
      expect(
        getContinuityDataFlowHealth(
          makePipeline({ isSilent: true, volumeDropPct: VOLUME_DROP_CRITICAL_PCT })
        )
      ).toBe('silent');
    });
  });

  describe('precedence order — matches get_continuity.ts if/else chain', () => {
    // This fixture documents the canonical precedence: silent > critical > warning > healthy.
    // If get_continuity.ts ever adds a new tier or changes the order, this test should fail
    // to prompt updating getContinuityDataFlowHealth alongside it.
    const PRECEDENCE_FIXTURES: Array<[Partial<PipelineStats>, string]> = [
      [{ isSilent: true, volumeDropPct: 100 }, 'silent'],
      [{ isSilent: false, volumeDropPct: 100 }, 'volume_drop_critical'],
      [{ isSilent: false, volumeDropPct: VOLUME_DROP_CRITICAL_PCT }, 'volume_drop_critical'],
      [{ isSilent: false, volumeDropPct: VOLUME_DROP_WARNING_PCT }, 'volume_drop_warning'],
      [{ isSilent: false, volumeDropPct: VOLUME_DROP_WARNING_PCT - 1 }, 'healthy'],
      [{ isSilent: false, volumeDropPct: null }, 'healthy'],
    ];

    PRECEDENCE_FIXTURES.forEach(([input, expected]) => {
      it(`${JSON.stringify(input)} → '${expected}'`, () => {
        expect(getContinuityDataFlowHealth(makePipeline(input))).toBe(expected);
      });
    });
  });
});
