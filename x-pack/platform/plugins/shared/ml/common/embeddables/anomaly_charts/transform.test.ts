/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnomalyChartsEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { anomalyChartsEmbeddableStateSchema } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { ML_ANOMALY_THRESHOLD } from '@kbn/ml-anomaly-utils';
import { transformIn } from './transform_in';
import { transformOut } from './transform_out';

describe('anomaly charts embeddable transforms', () => {
  describe('schema', () => {
    it('accepts anomaly charts state', () => {
      const state = anomalyChartsEmbeddableStateSchema.validate({
        job_ids: ['job-1', 'group-1'],
        max_series_to_plot: 12,
        severity_threshold: [{ min: 25, max: 50 }],
        time_range: { from: 'now-7d', to: 'now' },
        title: 'My anomaly charts',
      });

      expect(state).toEqual({
        job_ids: ['job-1', 'group-1'],
        max_series_to_plot: 12,
        severity_threshold: [{ min: 25, max: 50 }],
        time_range: { from: 'now-7d', to: 'now' },
        title: 'My anomaly charts',
      });
    });

    it('accepts optional max_series_to_plot and severity_threshold', () => {
      const state = anomalyChartsEmbeddableStateSchema.validate({
        job_ids: ['job-1'],
      });

      expect(state).toEqual({
        job_ids: ['job-1'],
      });
    });

    it('rejects an empty job_ids array', () => {
      expect(() =>
        anomalyChartsEmbeddableStateSchema.validate({
          job_ids: [],
        })
      ).toThrow();
    });

    it('rejects max_series_to_plot outside the supported range', () => {
      expect(() =>
        anomalyChartsEmbeddableStateSchema.validate({
          job_ids: ['job-1'],
          max_series_to_plot: 51,
        })
      ).toThrow();
    });

    it('rejects custom severity_threshold ranges', () => {
      expect(() =>
        anomalyChartsEmbeddableStateSchema.validate({
          job_ids: ['job-1'],
          severity_threshold: [{ min: 24, max: 48 }],
        })
      ).toThrow();
    });

    it('rejects more severity_threshold ranges than the supported severity buckets', () => {
      expect(() =>
        anomalyChartsEmbeddableStateSchema.validate({
          job_ids: ['job-1'],
          severity_threshold: [
            { min: 0, max: 3 },
            { min: 3, max: 25 },
            { min: 25, max: 50 },
            { min: 50, max: 75 },
            { min: 75 },
            { min: 90 },
          ],
        })
      ).toThrow();
    });
  });

  describe('transformIn', () => {
    it('passes state through with no references', () => {
      const state: AnomalyChartsEmbeddableState = {
        job_ids: ['job-1'],
        max_series_to_plot: 6,
      };
      expect(transformIn(state)).toEqual({ state, references: [] });
    });
  });

  describe('transformOut', () => {
    it('normalizes legacy camelCase stored state to snake_case', () => {
      const legacyStoredState = {
        title: 'Anomalies',
        timeRange: { from: 'now-7d', to: 'now' },
        hidePanelTitles: true,
        jobIds: ['job-1'],
        maxSeriesToPlot: 12,
        severityThreshold: [{ min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR }],
      } as unknown as AnomalyChartsEmbeddableState;

      expect(transformOut(legacyStoredState)).toEqual({
        title: 'Anomalies',
        time_range: { from: 'now-7d', to: 'now' },
        hide_title: true,
        job_ids: ['job-1'],
        max_series_to_plot: 12,
        severity_threshold: [{ min: ML_ANOMALY_THRESHOLD.MINOR, max: ML_ANOMALY_THRESHOLD.MAJOR }],
      });
    });

    it('strips runtime-only and wrapper fields', () => {
      const legacyStoredState = {
        jobIds: ['job-1'],
        maxSeriesToPlot: 6,
        severityThreshold: [{ min: ML_ANOMALY_THRESHOLD.LOW, max: ML_ANOMALY_THRESHOLD.WARNING }],
        selectedEntities: [{ fieldName: 'airline', fieldValue: 'AAL', operation: '+' }],
        id: 'legacy-hash',
        query: { query: 'foo', language: 'kuery' },
        filters: [{ meta: {} }],
        refreshConfig: { pause: true, value: 0 },
      } as unknown as AnomalyChartsEmbeddableState;

      expect(transformOut(legacyStoredState)).toEqual({
        job_ids: ['job-1'],
        max_series_to_plot: 6,
        severity_threshold: [{ min: ML_ANOMALY_THRESHOLD.LOW, max: ML_ANOMALY_THRESHOLD.WARNING }],
      });
    });

    it('returns already-snake_case state unchanged', () => {
      const state: AnomalyChartsEmbeddableState = {
        job_ids: ['job-1'],
        max_series_to_plot: 25,
        severity_threshold: [{ min: 50, max: 75 }],
        time_range: { from: 'now-1h', to: 'now' },
      };
      expect(transformOut(state)).toEqual(state);
    });

    it('throws when stored state is missing job_ids', () => {
      const storedState = {
        maxSeriesToPlot: 6,
      } as unknown as AnomalyChartsEmbeddableState;
      expect(() => transformOut(storedState)).toThrow(
        'Invalid anomaly charts embeddable state: missing job_ids'
      );
    });

    it('re-buckets a legacy single-number severityThreshold into canonical ranges', () => {
      const legacyStoredState = {
        jobIds: ['job-1'],
        severityThreshold: ML_ANOMALY_THRESHOLD.MAJOR,
      } as unknown as AnomalyChartsEmbeddableState;

      expect(transformOut(legacyStoredState).severity_threshold).toEqual([
        { min: ML_ANOMALY_THRESHOLD.MAJOR, max: ML_ANOMALY_THRESHOLD.CRITICAL },
        { min: ML_ANOMALY_THRESHOLD.CRITICAL },
      ]);
    });
  });
});
