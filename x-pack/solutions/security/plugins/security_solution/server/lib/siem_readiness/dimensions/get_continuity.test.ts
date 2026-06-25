/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { getContinuity } from './get_continuity';
import { fetchPipelines } from '../fetchers';

jest.mock('../fetchers', () => ({
  fetchPipelines: jest.fn(),
}));

const mockFetchPipelines = fetchPipelines as jest.Mock;

const esClient = {} as ElasticsearchClient;
const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() } as unknown as Logger;

const makePipeline = (overrides = {}) => ({
  name: 'my-pipeline',
  indices: ['logs-endpoint.events-000001'],
  docsCount: 1000,
  failedDocsCount: 0,
  statsAvailable: true,
  ...overrides,
});

describe('getContinuity', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('status', () => {
    it('returns noData when fetchPipelines returns an empty array', async () => {
      mockFetchPipelines.mockResolvedValueOnce([]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      expect(result.status).toBe('noData');
    });

    it('returns healthy when pipelines exist but none have critical failure rates', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({ docsCount: 100, failedDocsCount: 0 }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      expect(result.status).toBe('healthy');
    });

    it('returns actionsRequired when a pipeline exceeds the critical failure rate threshold', async () => {
      // 5% failure rate — above the 1% threshold
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({ docsCount: 100, failedDocsCount: 5 }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      expect(result.status).toBe('actionsRequired');
    });

    it('does not flag pipelines where statsAvailable is false', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({ statsAvailable: false, docsCount: 100, failedDocsCount: 99 }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      expect(result.status).toBe('healthy');
      expect(result.actionableFindings).toHaveLength(0);
    });
  });

  describe('items', () => {
    it('returns all raw pipelines regardless of category', async () => {
      const pipelines = [
        makePipeline({ name: 'p1', indices: ['logs-endpoint-000001'] }),
        makePipeline({ name: 'p2', indices: ['.internal-kibana-task-000001'] }),
      ];
      mockFetchPipelines.mockResolvedValueOnce(pipelines);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      expect(result.items).toHaveLength(2);
    });
  });

  describe('actionableFindings', () => {
    it('emits one finding per pipeline with a critical failure rate', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({ name: 'bad-pipeline', docsCount: 100, failedDocsCount: 10 }),
        makePipeline({ name: 'good-pipeline', docsCount: 100, failedDocsCount: 0 }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      expect(result.actionableFindings).toHaveLength(1);
      expect(result.actionableFindings[0].resource).toBe('bad-pipeline');
      expect(result.actionableFindings[0].severity).toBe('CRITICAL');
    });

    it('finding message includes the pipeline name and counts', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({ name: 'my-pipeline', docsCount: 200, failedDocsCount: 10 }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      expect(result.actionableFindings[0].message).toContain('my-pipeline');
      expect(result.actionableFindings[0].message).toContain('10');
    });

    it('emits a silence CRITICAL finding for a pipeline where isSilent is true', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({
          name: 'silent-pipeline',
          docsCount: 1000,
          failedDocsCount: 0,
          isSilent: true,
          silenceMs: 4 * 60 * 60 * 1000, // 4 hours
        }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      const silenceFinding = result.actionableFindings.find((f) => f.type === 'silence');
      expect(silenceFinding).toBeDefined();
      expect(silenceFinding?.severity).toBe('CRITICAL');
      expect(silenceFinding?.resource).toBe('silent-pipeline');
      expect(silenceFinding?.message).toContain('silent-pipeline');
    });

    it('merges silence and volume-drop into ONE finding when both apply to the same pipeline', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({
          name: 'silent-and-dropped-pipeline',
          docsCount: 1000,
          failedDocsCount: 0,
          isSilent: true,
          silenceMs: 2 * 60 * 60 * 1000,
          volumeDropPct: 100,
          lastFullDayDocs: 0,
          baseline7dAvg: 50,
        }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      // Must emit exactly one finding — not one for silence + one for volume drop
      expect(result.actionableFindings).toHaveLength(1);
      const finding = result.actionableFindings[0];
      expect(finding.type).toBe('silence');
      expect(finding.severity).toBe('CRITICAL');
      // Message must contain both the silence fact and the volume context
      expect(finding.message).toContain('silent-and-dropped-pipeline');
      expect(finding.message).toContain('100%');
      expect(finding.message).toContain('50');
    });

    it('emits a volume_drop_warning finding when volumeDropPct >= 50 and < 90', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({
          name: 'low-volume-pipeline',
          docsCount: 1000,
          failedDocsCount: 0,
          volumeDropPct: 60,
          lastFullDayDocs: 40,
          baseline7dAvg: 100,
        }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      const finding = result.actionableFindings.find((f) => f.type === 'volume_drop_warning');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('WARNING');
      expect(finding?.resource).toBe('low-volume-pipeline');
      expect(finding?.message).toContain('60%');
    });

    it('emits a volume_drop_critical finding when volumeDropPct >= 90', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({
          name: 'critical-volume-pipeline',
          docsCount: 1000,
          failedDocsCount: 0,
          volumeDropPct: 95,
          lastFullDayDocs: 5,
          baseline7dAvg: 100,
        }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      const finding = result.actionableFindings.find((f) => f.type === 'volume_drop_critical');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
      expect(finding?.resource).toBe('critical-volume-pipeline');
    });

    it('does not emit volume-drop findings when volumeDropPct is null', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({
          name: 'young-pipeline',
          docsCount: 100,
          failedDocsCount: 0,
          volumeDropPct: null,
        }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      const volumeFindings = result.actionableFindings.filter(
        (f) => f.type === 'volume_drop_warning' || f.type === 'volume_drop_critical'
      );
      expect(volumeFindings).toHaveLength(0);
    });

    it('pipeline_failure finding has type field set to pipeline_failure', async () => {
      mockFetchPipelines.mockResolvedValueOnce([
        makePipeline({ docsCount: 100, failedDocsCount: 10 }),
      ]);
      const result = await getContinuity({ esClient, isServerless: false, logger });
      expect(result.actionableFindings[0].type).toBe('pipeline_failure');
    });
  });
});
