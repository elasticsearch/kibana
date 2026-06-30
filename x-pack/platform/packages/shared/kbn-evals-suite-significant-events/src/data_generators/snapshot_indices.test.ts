/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getSnapshotKIFeaturesIndex,
  FEATURES_TEMP_INDEX_PATTERN,
  getSnapshotDiscoveriesIndex,
  DISCOVERIES_DATA_STREAM,
  DISCOVERIES_TEMP_INDEX_PATTERN,
  getSnapshotDetectionsIndex,
  DETECTIONS_DATA_STREAM,
  DETECTIONS_TEMP_INDEX_PATTERN,
  getSnapshotKnowledgeIndicatorsIndex,
  KNOWLEDGE_INDICATORS_TEMP_INDEX_PATTERN,
} from './snapshot_indices';

describe('sigevents_snapshot_indices', () => {
  describe('KI features', () => {
    it('exports the expected index pattern', () => {
      expect(FEATURES_TEMP_INDEX_PATTERN).toBe('sigevents-streams-features-*');
    });

    it('builds a single-dashed per-scenario index', () => {
      expect(getSnapshotKIFeaturesIndex('healthy-baseline')).toBe(
        'sigevents-streams-features-healthy-baseline'
      );
    });

    it('lowercases and replaces invalid characters with dashes', () => {
      expect(getSnapshotKIFeaturesIndex('Payment Unreachable')).toBe(
        'sigevents-streams-features-payment-unreachable'
      );

      expect(getSnapshotKIFeaturesIndex('A/B\\C*D?E"F<G>H|I,J#K')).toBe(
        'sigevents-streams-features-a-b-c-d-e-f-g-h-i-j-k'
      );
    });

    it('collapses multiple dashes and trims leading/trailing dashes', () => {
      expect(getSnapshotKIFeaturesIndex('---Payment---Unreachable---')).toBe(
        'sigevents-streams-features-payment-unreachable'
      );
    });

    it('falls back to unknown if sanitized name is empty', () => {
      expect(getSnapshotKIFeaturesIndex('   ')).toBe('sigevents-streams-features-unknown');
      expect(getSnapshotKIFeaturesIndex('###')).toBe('sigevents-streams-features-unknown');
    });
  });

  describe('discoveries', () => {
    it('exposes the source data stream, cleanup pattern, and per-scenario index', () => {
      expect(DISCOVERIES_DATA_STREAM).toBe('.significant_events-discoveries');
      expect(DISCOVERIES_TEMP_INDEX_PATTERN).toBe('sigevents-discoveries-*');
      expect(getSnapshotDiscoveriesIndex('healthy-baseline')).toBe(
        'sigevents-discoveries-healthy-baseline'
      );
    });

    it('keeps the per-scenario index as a regular (non-dot) index the pattern matches', () => {
      const index = getSnapshotDiscoveriesIndex('ledger-db-disconnect');
      expect(index.startsWith('.')).toBe(false);
      expect(index.startsWith('sigevents-discoveries-')).toBe(true);
    });

    it('sanitizes the scenario name', () => {
      expect(getSnapshotDiscoveriesIndex('Payment Unreachable')).toBe(
        'sigevents-discoveries-payment-unreachable'
      );
      expect(getSnapshotDiscoveriesIndex('   ')).toBe('sigevents-discoveries-unknown');
    });
  });

  describe('detections', () => {
    it('exposes the source data stream, cleanup pattern, and per-scenario index', () => {
      expect(DETECTIONS_DATA_STREAM).toBe('.significant_events-detections');
      expect(DETECTIONS_TEMP_INDEX_PATTERN).toBe('sigevents-detections-*');
      expect(getSnapshotDetectionsIndex('healthy-baseline')).toBe(
        'sigevents-detections-healthy-baseline'
      );
    });

    it('sanitizes the scenario name', () => {
      expect(getSnapshotDetectionsIndex('Payment Unreachable')).toBe(
        'sigevents-detections-payment-unreachable'
      );
      expect(getSnapshotDetectionsIndex('###')).toBe('sigevents-detections-unknown');
    });
  });

  describe('knowledge indicators', () => {
    it('exposes the cleanup pattern and per-scenario index', () => {
      expect(KNOWLEDGE_INDICATORS_TEMP_INDEX_PATTERN).toBe('sigevents-knowledge-indicators-*');
      expect(getSnapshotKnowledgeIndicatorsIndex('healthy-baseline')).toBe(
        'sigevents-knowledge-indicators-healthy-baseline'
      );
    });

    it('sanitizes the scenario name', () => {
      expect(getSnapshotKnowledgeIndicatorsIndex('Payment Unreachable')).toBe(
        'sigevents-knowledge-indicators-payment-unreachable'
      );
      expect(getSnapshotKnowledgeIndicatorsIndex('   ')).toBe(
        'sigevents-knowledge-indicators-unknown'
      );
    });
  });
});
