/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicy } from '../types/models';

import { getAgentlessThroughputIndexPatterns } from './agentless_throughput_helper';

const makePolicy = (
  streams: Array<{ enabled: boolean; type?: string; dataset: string }>
): Pick<PackagePolicy, 'inputs'> =>
  ({
    inputs: [
      {
        type: 'test-input',
        enabled: true,
        streams: streams.map((s) => ({
          enabled: s.enabled,
          data_stream: { type: s.type ?? 'logs', dataset: s.dataset },
        })),
      },
    ],
  } as unknown as Pick<PackagePolicy, 'inputs'>);

describe('getAgentlessThroughputIndexPatterns', () => {
  it('returns empty array when there are no inputs', () => {
    expect(getAgentlessThroughputIndexPatterns({ inputs: [] })).toEqual([]);
  });

  it('returns empty array when all streams are disabled', () => {
    const policy = makePolicy([{ enabled: false, dataset: 'nginx.access' }]);
    expect(getAgentlessThroughputIndexPatterns(policy)).toEqual([]);
  });

  it('uses "logs" as default type when data_stream.type is absent', () => {
    const policy = makePolicy([{ enabled: true, dataset: 'nginx.access' }]);
    expect(getAgentlessThroughputIndexPatterns(policy)).toEqual(['logs-nginx.access-*']);
  });

  it('uses the explicit type when provided', () => {
    const policy = makePolicy([{ enabled: true, type: 'metrics', dataset: 'nginx.status' }]);
    expect(getAgentlessThroughputIndexPatterns(policy)).toEqual(['metrics-nginx.status-*']);
  });

  it('deduplicates patterns from streams with the same type+dataset', () => {
    const policy = makePolicy([
      { enabled: true, dataset: 'nginx.access' },
      { enabled: true, dataset: 'nginx.access' },
    ]);
    expect(getAgentlessThroughputIndexPatterns(policy)).toEqual(['logs-nginx.access-*']);
  });

  it('returns distinct patterns for streams with different datasets', () => {
    const policy = makePolicy([
      { enabled: true, type: 'logs', dataset: 'nginx.access' },
      { enabled: true, type: 'metrics', dataset: 'nginx.status' },
    ]);
    expect(getAgentlessThroughputIndexPatterns(policy)).toEqual([
      'logs-nginx.access-*',
      'metrics-nginx.status-*',
    ]);
  });

  it('flattens streams across multiple inputs', () => {
    const policy = {
      inputs: [
        {
          type: 'input-a',
          enabled: true,
          streams: [{ enabled: true, data_stream: { type: 'logs', dataset: 'nginx.access' } }],
        },
        {
          type: 'input-b',
          enabled: true,
          streams: [{ enabled: true, data_stream: { type: 'metrics', dataset: 'nginx.status' } }],
        },
      ],
    } as unknown as Pick<PackagePolicy, 'inputs'>;
    expect(getAgentlessThroughputIndexPatterns(policy)).toEqual([
      'logs-nginx.access-*',
      'metrics-nginx.status-*',
    ]);
  });

  it('excludes disabled streams while including enabled ones in the same input', () => {
    const policy = {
      inputs: [
        {
          type: 'input-a',
          enabled: true,
          streams: [
            { enabled: true, data_stream: { type: 'logs', dataset: 'nginx.access' } },
            { enabled: false, data_stream: { type: 'logs', dataset: 'nginx.error' } },
          ],
        },
      ],
    } as unknown as Pick<PackagePolicy, 'inputs'>;
    expect(getAgentlessThroughputIndexPatterns(policy)).toEqual(['logs-nginx.access-*']);
  });
});
