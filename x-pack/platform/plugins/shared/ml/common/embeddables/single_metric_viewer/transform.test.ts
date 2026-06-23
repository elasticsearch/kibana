/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import { singleMetricViewerEmbeddableStateSchema } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import { transformIn } from './transform_in';
import { transformOut } from './transform_out';

describe('single metric viewer embeddable transforms', () => {
  describe('schema', () => {
    it('accepts a minimal state and defaults selected_detector_index to 0', () => {
      const state = singleMetricViewerEmbeddableStateSchema.validate({
        job_ids: ['job-1'],
      });

      expect(state).toEqual({
        job_ids: ['job-1'],
        selected_detector_index: 0,
      });
    });

    it('accepts a fully populated state', () => {
      const state = singleMetricViewerEmbeddableStateSchema.validate({
        job_ids: ['job-1'],
        selected_detector_index: 2,
        selected_entities: { airline: 'AAL' },
        function_description: 'mean',
        forecast_id: 'forecast-123',
        time_range: { from: 'now-7d', to: 'now' },
        title: 'My single metric viewer',
      });

      expect(state).toEqual({
        job_ids: ['job-1'],
        selected_detector_index: 2,
        selected_entities: { airline: 'AAL' },
        function_description: 'mean',
        forecast_id: 'forecast-123',
        time_range: { from: 'now-7d', to: 'now' },
        title: 'My single metric viewer',
      });
    });

    it('rejects an empty job_ids array', () => {
      expect(() =>
        singleMetricViewerEmbeddableStateSchema.validate({
          job_ids: [],
        })
      ).toThrow();
    });

    it('rejects multiple job_ids', () => {
      expect(() =>
        singleMetricViewerEmbeddableStateSchema.validate({
          job_ids: ['job-1', 'job-2'],
        })
      ).toThrow();
    });

    it('rejects a negative selected_detector_index', () => {
      expect(() =>
        singleMetricViewerEmbeddableStateSchema.validate({
          job_ids: ['job-1'],
          selected_detector_index: -1,
        })
      ).toThrow();
    });
  });

  describe('transformIn', () => {
    it('passes state through with no references', () => {
      const state: SingleMetricViewerEmbeddableState = {
        job_ids: ['job-1'],
        selected_detector_index: 0,
      };
      expect(transformIn(state)).toEqual({ state, references: [] });
    });
  });

  describe('transformOut', () => {
    it('normalizes legacy camelCase stored state to snake_case', () => {
      const legacyStoredState = {
        title: 'Single metric',
        timeRange: { from: 'now-7d', to: 'now' },
        hidePanelTitles: true,
        jobIds: ['job-1'],
        selectedDetectorIndex: 2,
        selectedEntities: { airline: 'AAL' },
        functionDescription: 'mean',
        forecastId: 'forecast-123',
      } as unknown as SingleMetricViewerEmbeddableState;

      expect(transformOut(legacyStoredState)).toEqual({
        title: 'Single metric',
        time_range: { from: 'now-7d', to: 'now' },
        hide_title: true,
        job_ids: ['job-1'],
        selected_detector_index: 2,
        selected_entities: { airline: 'AAL' },
        function_description: 'mean',
        forecast_id: 'forecast-123',
      });
    });

    it('heals a legacy `avg` function_description to the ML name `mean`', () => {
      const legacyStoredState = {
        jobIds: ['job-1'],
        selectedDetectorIndex: 0,
        functionDescription: 'avg',
      } as unknown as SingleMetricViewerEmbeddableState;

      expect(transformOut(legacyStoredState)).toEqual({
        job_ids: ['job-1'],
        selected_detector_index: 0,
        function_description: 'mean',
      });
    });

    it('defaults selected_detector_index to 0 when legacy state omits it', () => {
      const legacyStoredState = {
        jobIds: ['job-1'],
      } as unknown as SingleMetricViewerEmbeddableState;

      expect(transformOut(legacyStoredState)).toEqual({
        job_ids: ['job-1'],
        selected_detector_index: 0,
      });
    });

    it('strips legacy id, query, filters, refreshConfig, and panelTitle fields', () => {
      const legacyStoredState = {
        jobIds: ['job-1'],
        selectedDetectorIndex: 0,
        id: 'legacy-hash',
        query: { query: 'foo', language: 'kuery' },
        filters: [{ meta: {} }],
        refreshConfig: { pause: true, value: 0 },
        panelTitle: 'legacy panel title',
      } as unknown as SingleMetricViewerEmbeddableState;

      expect(transformOut(legacyStoredState)).toEqual({
        job_ids: ['job-1'],
        selected_detector_index: 0,
      });
    });

    it('returns already-snake_case state unchanged', () => {
      const state: SingleMetricViewerEmbeddableState = {
        job_ids: ['job-1'],
        selected_detector_index: 1,
        forecast_id: 'forecast-123',
        time_range: { from: 'now-1h', to: 'now' },
      };
      expect(transformOut(state)).toEqual(state);
    });

    it('throws when stored state is missing job_ids', () => {
      const storedState = {
        selectedDetectorIndex: 0,
      } as unknown as SingleMetricViewerEmbeddableState;
      expect(() => transformOut(storedState)).toThrow(
        'Invalid single metric viewer embeddable state: missing job_ids'
      );
    });
  });
});
