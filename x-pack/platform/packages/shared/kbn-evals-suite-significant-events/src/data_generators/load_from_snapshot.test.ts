/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { GCS_BUCKET, OTEL_DEMO_GCS_BASE_PATH_PREFIX } from '../constants';
import type { GcsConfig } from './snapshot_run_config';

const mockCreateGcsRepository = jest.fn(() => ({ mocked: true }));
const mockRestoreSnapshot = jest.fn();

jest.mock('@kbn/es-snapshot-loader', () => ({
  createGcsRepository: mockCreateGcsRepository,
  restoreSnapshot: mockRestoreSnapshot,
}));

describe('load_from_snapshot: loadKIFeaturesFromSnapshot', () => {
  interface EsClientMock {
    indices: {
      delete: jest.MockedFunction<Client['indices']['delete']>;
    };
    search: jest.MockedFunction<Client['search']>;
  }

  const log: jest.Mocked<Pick<ToolingLog, 'info' | 'debug' | 'warning' | 'error'>> = {
    info: jest.fn(),
    debug: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  };

  const gcs: GcsConfig = { bucket: GCS_BUCKET, basePathPrefix: OTEL_DEMO_GCS_BASE_PATH_PREFIX };

  const makeEsClient = (): EsClientMock => ({
    indices: {
      delete: jest.fn(),
    },
    search: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SIGEVENTS_SNAPSHOT_RUN = '2026-02-26-test';
    jest.resetModules();
  });

  it('returns an empty array when allowNoMatches results in zero restored indices', async () => {
    mockRestoreSnapshot.mockResolvedValue({
      success: true,
      snapshotName: 'payment-unreachable',
      restoredIndices: [],
      errors: [],
    });

    const esClient = makeEsClient();
    const { loadKIFeaturesFromSnapshot } = await import('./load_from_snapshot');
    esClient.indices.delete.mockResolvedValue({} as never);
    esClient.search.mockResolvedValue({ hits: { hits: [] } } as never);

    const features = await loadKIFeaturesFromSnapshot(
      esClient as unknown as Client,
      log as unknown as ToolingLog,
      'payment-unreachable',
      gcs,
      'logs'
    );

    expect(features).toEqual([]);
    expect(esClient.search).not.toHaveBeenCalled();
  });

  it('restores into temp index and returns matching KI feature docs', async () => {
    mockRestoreSnapshot.mockImplementation(
      async ({
        snapshotName,
        renameReplacement,
      }: {
        snapshotName: string;
        renameReplacement: string;
      }) => ({
        success: true,
        snapshotName,
        restoredIndices: [renameReplacement],
        errors: [],
      })
    );

    const esClient = makeEsClient();
    esClient.indices.delete.mockResolvedValue({} as never);
    esClient.search.mockResolvedValue({
      hits: {
        hits: [
          { _source: { uuid: 'u1', id: 'f1', stream_name: 'logs', type: 'entity' } },
          { _source: { uuid: 'u2', id: 'f2', stream_name: 'logs', type: 'dependency' } },
        ],
      },
    } as never);

    const { loadKIFeaturesFromSnapshot } = await import('./load_from_snapshot');
    const features = await loadKIFeaturesFromSnapshot(
      esClient as unknown as Client,
      log as unknown as ToolingLog,
      'payment-unreachable',
      gcs,
      'logs'
    );

    expect(features).toHaveLength(2);

    expect(mockCreateGcsRepository).toHaveBeenCalledWith({
      bucket: GCS_BUCKET,
      basePath: `2026-02-26-test/${OTEL_DEMO_GCS_BASE_PATH_PREFIX}`,
    });

    const restoreArgs = mockRestoreSnapshot.mock.calls[0][0] as { renameReplacement: string };
    const tempIndex = restoreArgs.renameReplacement;

    expect(mockRestoreSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotName: 'payment-unreachable',
        renamePattern: '(.+)',
        renameReplacement: expect.stringMatching(/^sigevents-replay-temp-features-/),
        allowNoMatches: true,
      })
    );

    expect(esClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: tempIndex,
      })
    );
  });

  it('throws if restore succeeds but did not produce the expected temp index', async () => {
    mockRestoreSnapshot.mockResolvedValue({
      success: true,
      snapshotName: 'healthy-baseline',
      restoredIndices: ['some-other-index'],
      errors: [],
    });

    const esClient = makeEsClient();
    const { loadKIFeaturesFromSnapshot } = await import('./load_from_snapshot');
    esClient.indices.delete.mockResolvedValue({} as never);
    esClient.search.mockResolvedValue({ hits: { hits: [] } } as never);

    await expect(
      loadKIFeaturesFromSnapshot(
        esClient as unknown as Client,
        log as unknown as ToolingLog,
        'healthy-baseline',
        gcs,
        'logs'
      )
    ).rejects.toThrow(/did not produce expected temp index/i);
  });

  it('cleans up the temp index at the end even if search throws', async () => {
    const { loadKIFeaturesFromSnapshot } = await import('./load_from_snapshot');
    mockRestoreSnapshot.mockImplementation(
      async ({
        snapshotName,
        renameReplacement,
      }: {
        snapshotName: string;
        renameReplacement: string;
      }) => ({
        success: true,
        snapshotName,
        restoredIndices: [renameReplacement],
        errors: [],
      })
    );

    const esClient = makeEsClient();
    esClient.indices.delete.mockResolvedValue({} as never);
    esClient.search.mockRejectedValue(new Error('boom'));

    await expect(
      loadKIFeaturesFromSnapshot(
        esClient as unknown as Client,
        log as unknown as ToolingLog,
        'payment-unreachable',
        gcs,
        'logs'
      )
    ).rejects.toThrow('boom');

    const restoreArgs = mockRestoreSnapshot.mock.calls[0][0] as { renameReplacement: string };
    const tempIndex = restoreArgs.renameReplacement;

    expect(esClient.indices.delete.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(esClient.indices.delete).toHaveBeenCalledWith({
      index: tempIndex,
      ignore_unavailable: true,
    });
  });
});
