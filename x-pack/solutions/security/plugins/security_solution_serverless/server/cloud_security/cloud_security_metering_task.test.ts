/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import Chance from 'chance';
import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';

import type { CloudSetup } from '@kbn/cloud-plugin/server';

import { cloudSecurityMetringCallback, getCloudProductTier } from './cloud_security_metering';
import {
  getCloudSecurityUsageRecord,
  getSearchQueryByCloudSecuritySolution,
  getGcpComputeDurationFilter,
  getGcpComputeDurationRuntimeMapping,
  getAssetAggQueryByCloudSecuritySolution,
} from './cloud_security_metering_task';

import type { ServerlessSecurityConfig } from '../config';
import type { MeteringCallbackInput } from '../types';

import type { ProductTier } from '../../common/product';
import {
  CLOUD_SECURITY_TASK_TYPE,
  CSPM,
  KSPM,
  CNVM,
  BILLABLE_ASSETS_CONFIG,
  GCP_COMPUTE_MIN_RUNNING_DURATION_HOURS,
  GCP_COMPUTE_INSTANCE_SUB_TYPE,
  GCP_COMPUTE_DURATION_RUNTIME_FIELD,
} from './constants';

const mockEsClient = elasticsearchServiceMock.createStart().client.asInternalUser;
const logger: ReturnType<typeof loggingSystemMock.createLogger> = loggingSystemMock.createLogger();
const chance = new Chance();

const cloudSecuritySolutions: Array<typeof CSPM | typeof KSPM> = [CSPM, KSPM];

describe('getCloudSecurityUsageRecord', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return undefined if cloudSecuritySolution is missing', async () => {
    // Mock Elasticsearch search to throw an error
    mockEsClient.search.mockRejectedValue({});

    const projectId = chance.guid();
    const taskId = chance.guid();
    const cloudSecuritySolution = CSPM;

    const tier = 'essentials' as ProductTier;

    const result = await getCloudSecurityUsageRecord({
      esClient: mockEsClient,
      projectId,
      logger,
      taskId,
      lastSuccessfulReport: new Date(),
      cloudSecuritySolution,
      tier,
    });

    expect(result).toBeUndefined();
  });

  test.each(cloudSecuritySolutions)(
    'should return usageRecords with correct values for cspm and kspm when Elasticsearch response has aggregations',
    async (cloudSecuritySolution) => {
      // @ts-ignore
      mockEsClient.search.mockResolvedValueOnce({
        hits: { hits: [{ _id: 'someRecord', _index: 'mockIndex' }] }, // mocking for indexHasDataInDateRange
      });
      const randomIndex = Math.floor(
        Math.random() * BILLABLE_ASSETS_CONFIG[cloudSecuritySolution].values.length
      );
      const randomBillableAsset = BILLABLE_ASSETS_CONFIG[cloudSecuritySolution].values[randomIndex];

      // @ts-ignore
      mockEsClient.search.mockResolvedValueOnce({
        aggregations: {
          resource_sub_type: {
            buckets: [
              {
                key: randomBillableAsset,
                doc_count: 100,
                unique_assets: { value: 10 },
              },
              {
                key: 'not_billable_asset',
                doc_count: 50,
                unique_assets: { value: 11 },
              },
            ],
          },
          min_timestamp: {
            value_as_string: '2023-07-30T15:11:41.738Z',
          },
        },
      });

      const projectId = chance.guid();
      const taskId = chance.guid();

      const tier = 'essentials' as ProductTier;

      const result = await getCloudSecurityUsageRecord({
        esClient: mockEsClient,
        projectId,
        logger,
        taskId,
        lastSuccessfulReport: new Date(),
        cloudSecuritySolution,
        tier,
      });

      expect(result).toEqual([
        {
          id: expect.stringContaining(
            `${CLOUD_SECURITY_TASK_TYPE}_${cloudSecuritySolution}_${projectId}`
          ),
          usage_timestamp: '2023-07-30T15:11:41.738Z',
          creation_timestamp: expect.any(String), // Expect a valid ISO string
          usage: {
            type: CLOUD_SECURITY_TASK_TYPE,
            sub_type: cloudSecuritySolution,
            quantity: 10,
            period_seconds: expect.any(Number),
            metadata: {
              [randomBillableAsset]: '10',
              not_billable_asset: '11',
            },
          },
          source: {
            id: taskId,
            instance_group_id: projectId,
            metadata: {
              tier: 'essentials',
            },
          },
        },
      ]);
    }
  );

  it('should return usageRecords with correct values for cnvm when Elasticsearch response has aggregations', async () => {
    const cloudSecuritySolution = CNVM;

    // @ts-ignore
    mockEsClient.search.mockResolvedValueOnce({
      hits: { hits: [{ _id: 'someRecord', _index: 'mockIndex' }] }, // mocking for indexHasDataInDateRange
    });

    // @ts-ignore
    mockEsClient.search.mockResolvedValueOnce({
      aggregations: {
        unique_assets: {
          value: 10,
        },
        min_timestamp: {
          value_as_string: '2023-07-30T15:11:41.738Z',
        },
      },
    });

    const projectId = chance.guid();
    const taskId = chance.guid();

    const tier = 'essentials' as ProductTier;
    const result = await getCloudSecurityUsageRecord({
      esClient: mockEsClient,
      projectId,
      logger,
      taskId,
      lastSuccessfulReport: new Date(),
      cloudSecuritySolution,
      tier,
    });

    expect(result).toEqual([
      {
        id: expect.stringContaining(`${CLOUD_SECURITY_TASK_TYPE}_cnvm_${projectId}`),
        usage_timestamp: '2023-07-30T15:11:41.738Z',
        creation_timestamp: expect.any(String), // Expect a valid ISO string
        usage: {
          type: CLOUD_SECURITY_TASK_TYPE,
          sub_type: CNVM,
          quantity: 10,
          period_seconds: expect.any(Number),
        },
        source: {
          id: taskId,
          instance_group_id: projectId,
          metadata: {
            tier: 'essentials',
          },
        },
      },
    ]);
  });

  it('should return undefined when Elasticsearch response does not have aggregations', async () => {
    // @ts-ignore
    mockEsClient.search.mockResolvedValue({});

    const projectId = chance.guid();
    const taskId = chance.guid();
    const cloudSecuritySolution = CSPM;

    const tier = 'essentials' as ProductTier;

    const result = await getCloudSecurityUsageRecord({
      esClient: mockEsClient,
      projectId,
      logger,
      taskId,
      lastSuccessfulReport: new Date(),
      cloudSecuritySolution,
      tier,
    });

    expect(result).toBeUndefined();
  });

  it('should return undefined if an error occurs during Elasticsearch search', async () => {
    // Mock Elasticsearch search to throw an error
    mockEsClient.search.mockRejectedValue(new Error('Elasticsearch search error'));

    const projectId = chance.guid();
    const taskId = chance.guid();
    const cloudSecuritySolution = CSPM;

    const tier = 'essentials' as ProductTier;

    const result = await getCloudSecurityUsageRecord({
      esClient: mockEsClient,
      projectId,
      logger,
      taskId,
      lastSuccessfulReport: new Date(),
      cloudSecuritySolution,
      tier,
    });

    expect(result).toBeUndefined();
  });
});

describe('getSearchQueryByCloudSecuritySolution', () => {
  it('should return the correct search query for CSPM', () => {
    const result = getSearchQueryByCloudSecuritySolution('cspm');

    expect(result).toEqual({
      bool: {
        must: [
          {
            range: {
              '@timestamp': {
                gte: 'now-24h',
              },
            },
          },
          {
            term: {
              'rule.benchmark.posture_type': 'cspm',
            },
          },
        ],
      },
    });
  });

  it('should return the correct search query for KSPM', () => {
    const result = getSearchQueryByCloudSecuritySolution('kspm');

    expect(result).toEqual({
      bool: {
        must: [
          {
            range: {
              '@timestamp': {
                gte: 'now-24h',
              },
            },
          },
          {
            term: {
              'rule.benchmark.posture_type': 'kspm',
            },
          },
        ],
      },
    });
  });

  it('should return the correct search query for CNVM', () => {
    const result = getSearchQueryByCloudSecuritySolution(CNVM);

    expect(result).toEqual({
      bool: {
        must: [
          {
            range: {
              '@timestamp': {
                gte: 'now-24h',
              },
            },
          },
        ],
      },
    });
  });
});

describe('getGcpComputeDurationFilter', () => {
  const minDurationMillis = GCP_COMPUTE_MIN_RUNNING_DURATION_HOURS * 60 * 60 * 1000;

  it('should pass non-gcp-compute-instance docs and gate gcp-compute-instance docs on the runtime field', () => {
    const filter = getGcpComputeDurationFilter();

    expect(filter).toEqual({
      bool: {
        should: [
          {
            bool: {
              must_not: [{ term: { 'resource.sub_type': GCP_COMPUTE_INSTANCE_SUB_TYPE } }],
            },
          },
          {
            bool: {
              must: [
                { term: { 'resource.sub_type': GCP_COMPUTE_INSTANCE_SUB_TYPE } },
                {
                  range: {
                    [GCP_COMPUTE_DURATION_RUNTIME_FIELD]: { gte: minDurationMillis },
                  },
                },
              ],
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  });

  it('should use 24 hours as the minimum running duration', () => {
    const filter = getGcpComputeDurationFilter();
    const [, gcpComputeClause] = filter.bool.should;

    expect(gcpComputeClause).toEqual({
      bool: {
        must: [
          { term: { 'resource.sub_type': GCP_COMPUTE_INSTANCE_SUB_TYPE } },
          {
            range: {
              [GCP_COMPUTE_DURATION_RUNTIME_FIELD]: { gte: 24 * 60 * 60 * 1000 },
            },
          },
        ],
      },
    });
  });
});

describe('getGcpComputeDurationRuntimeMapping', () => {
  it('should define a long runtime field with nowMillis, lookbackStartMs and subType params', () => {
    const nowMillis = Date.now();
    const mapping = getGcpComputeDurationRuntimeMapping(nowMillis);

    expect(mapping[GCP_COMPUTE_DURATION_RUNTIME_FIELD]).toMatchObject({
      type: 'long',
      script: {
        lang: 'painless',
        params: {
          nowMillis,
          // must stay aligned with the now-24h @timestamp range filter (ASSETS_SAMPLE_GRANULARITY)
          lookbackStartMs: nowMillis - 24 * 60 * 60 * 1000,
          subType: GCP_COMPUTE_INSTANCE_SUB_TYPE,
        },
      },
    });
  });

  it('should only count stopped instances whose stop event falls within the look-back window', () => {
    const mapping = getGcpComputeDurationRuntimeMapping(Date.now());
    const source: string = mapping[GCP_COMPUTE_DURATION_RUNTIME_FIELD].script.source;

    // A stopped instance with a >=24h historical run must not be re-billed on every
    // later day it appears in scans — only during the window in which it stopped.
    const guardIndex = source.indexOf("if (lastStopMs < params['lookbackStartMs']) return;");
    expect(guardIndex).toBeGreaterThan(-1);
    // The guard must run before the duration is emitted
    expect(guardIndex).toBeLessThan(source.indexOf('emit('));
  });

  it('should read _source via params and not use doc[] for resource.raw fields', () => {
    const mapping = getGcpComputeDurationRuntimeMapping(Date.now());
    const source: string = mapping[GCP_COMPUTE_DURATION_RUNTIME_FIELD].script.source;

    expect(source).toContain("params['_source']");
    expect(source).not.toContain("doc['resource.raw");
    expect(source).toContain('lastStartTimestamp');
    expect(source).toContain('lastStopTimestamp');
    expect(source).toContain('emit(');
  });

  it('should guard the _source access and timestamp parsing so a malformed doc cannot abort the search', () => {
    const mapping = getGcpComputeDurationRuntimeMapping(Date.now());
    const source: string = mapping[GCP_COMPUTE_DURATION_RUNTIME_FIELD].script.source;

    // A runtime-field script error fails the whole search request, and the metering callers
    // swallow errors log-only — so an unguarded parse would silently zero all CSPM usage.
    expect(source).toContain('try {');
    expect(source).toContain('catch (Exception e)');
    // Both ZonedDateTime.parse calls must be inside the try block
    const tryIndex = source.indexOf('try {');
    expect(source.indexOf('ZonedDateTime.parse')).toBeGreaterThan(tryIndex);
    expect(source.lastIndexOf('ZonedDateTime.parse')).toBeGreaterThan(tryIndex);
    expect(source.indexOf('catch')).toBeGreaterThan(source.lastIndexOf('emit('));
  });
});

describe('getAssetAggQueryByCloudSecuritySolution', () => {
  it('should include runtime_mappings and GCP duration filter for CSPM', () => {
    const result = getAssetAggQueryByCloudSecuritySolution(CSPM);

    if (!('runtime_mappings' in result)) {
      throw new Error('expected the CSPM asset agg query to include runtime_mappings');
    }
    expect(result.runtime_mappings).toHaveProperty(GCP_COMPUTE_DURATION_RUNTIME_FIELD);
    expect(result.query.bool.must).toHaveLength(2);
  });

  it('should not include runtime_mappings for KSPM', () => {
    const result = getAssetAggQueryByCloudSecuritySolution(KSPM);
    expect(result).not.toHaveProperty('runtime_mappings');
  });

  it('should not include runtime_mappings for CNVM', () => {
    const result = getAssetAggQueryByCloudSecuritySolution(CNVM);
    expect(result).not.toHaveProperty('runtime_mappings');
  });
});

describe('should return the relevant product tier', () => {
  it('should return the relevant product tier for cloud product line', async () => {
    const serverlessSecurityConfig = {
      enabled: true,
      developer: {},
      productTypes: [
        { product_line: 'endpoint', product_tier: 'essentials' },
        { product_line: 'cloud', product_tier: 'complete' },
      ],
    } as unknown as ServerlessSecurityConfig;

    const tier = getCloudProductTier(serverlessSecurityConfig, logger);

    expect(tier).toBe('complete');
  });

  it('should return none tier in case cloud product line is missing ', async () => {
    const serverlessSecurityConfig = {
      enabled: true,
      developer: {},
      productTypes: [{ product_line: 'endpoint', product_tier: 'complete' }],
    } as unknown as ServerlessSecurityConfig;

    const tier = getCloudProductTier(serverlessSecurityConfig, logger);

    expect(tier).toBe('none');
  });
});

describe('cloudSecurityMetringCallback', () => {
  const buildInput = (config: ServerlessSecurityConfig): MeteringCallbackInput => ({
    esClient: mockEsClient,
    cloudSetup: { serverless: { projectId: 'project-id' } } as CloudSetup,
    logger,
    taskId: 'task-id',
    lastSuccessfulReport: new Date(),
    signal: new AbortController().signal,
    config,
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return no records if cloud product line is missing', async () => {
    const result = await cloudSecurityMetringCallback(
      buildInput({
        productTypes: [{ product_line: 'endpoint', product_tier: 'complete' }],
      } as unknown as ServerlessSecurityConfig)
    );

    expect(result).toEqual({ records: [] });
    expect(mockEsClient.search).not.toHaveBeenCalled();
  });

  it('should collect usage for CSPM, KSPM and CNVM', async () => {
    mockEsClient.search.mockResolvedValue({
      hits: { hits: [] },
    } as never);

    await cloudSecurityMetringCallback(
      buildInput({
        productTypes: [{ product_line: 'cloud', product_tier: 'complete' }],
        cloudSecurityMetering: { cspm: { enabled: true } },
      } as unknown as ServerlessSecurityConfig)
    );

    expect(mockEsClient.search).toHaveBeenCalledTimes(3);
  });

  it('should skip CSPM usage when CSPM metering is disabled', async () => {
    mockEsClient.search.mockResolvedValue({
      hits: { hits: [] },
    } as never);

    await cloudSecurityMetringCallback(
      buildInput({
        productTypes: [{ product_line: 'cloud', product_tier: 'complete' }],
        cloudSecurityMetering: { cspm: { enabled: false } },
      } as unknown as ServerlessSecurityConfig)
    );

    expect(mockEsClient.search).toHaveBeenCalledTimes(2);
  });
});
