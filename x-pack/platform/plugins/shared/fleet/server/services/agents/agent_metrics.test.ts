/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { appContextService } from '../app_context';

import { fetchAndAssignAgentMetrics } from './agent_metrics';

describe('fetchAndAssignAgentMetrics', () => {
  const mockLogger = { warn: jest.fn() } as any;
  beforeAll(() => {
    jest.spyOn(appContextService, 'getLogger').mockReturnValue(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns agents with metrics from both fleet and opamp', async () => {
    const esClient = {
      search: jest
        .fn()
        // First call: _fetchAndAssignAgentMetrics (for FLEET)
        .mockResolvedValueOnce({
          aggregations: {
            agents: {
              buckets: [
                { key: 'a1', sum_memory_size: { value: 100 }, sum_cpu: { value: 1.23 } },
                { key: 'a3', sum_memory_size: { value: 300 }, sum_cpu: { value: 3.23 } },
              ],
            },
          },
        })
        // Second call: _fetchAndAssignOtelMetrics (for OPAMP)
        .mockResolvedValueOnce({
          aggregations: {
            agents: {
              buckets: [{ key: 'a2', max_memory_size: { value: 200 }, avg_cpu: { value: 2.34 } }],
            },
          },
        }),
    };
    const agents = [
      { id: 'a1', type: 'FLEET' },
      { id: 'a2', type: 'OPAMP' },
      { id: 'a3', type: 'FLEET' },
    ];
    const result = await fetchAndAssignAgentMetrics(esClient as any, agents as any);
    expect(result).toEqual([
      { id: 'a1', type: 'FLEET', metrics: { cpu_avg: 1.23, memory_size_byte_avg: 100 } },
      { id: 'a2', type: 'OPAMP', metrics: { cpu_avg: 2.34, memory_size_byte_avg: 200 } },
      { id: 'a3', type: 'FLEET', metrics: { cpu_avg: 3.23, memory_size_byte_avg: 300 } },
    ]);
    expect(esClient.search).toHaveBeenCalledTimes(2);
  });

  it('uses elastic.display.name as service.instance.id for OPAMP agents when present', async () => {
    const esClient = {
      search: jest
        .fn()
        .mockResolvedValueOnce({ aggregations: { agents: { buckets: [] } } })
        .mockResolvedValueOnce({
          aggregations: {
            agents: {
              buckets: [
                {
                  key: 'my-collector-host',
                  max_memory_size: { value: 512 },
                  avg_cpu: { value: 0.5 },
                },
              ],
            },
          },
        }),
    };
    const agents = [
      {
        id: 'opamp-fleet-id',
        type: 'OPAMP',
        non_identifying_attributes: { 'elastic.display.name': 'my-collector-host' },
      },
    ];
    const result = await fetchAndAssignAgentMetrics(esClient as any, agents as any);
    expect(result).toEqual([
      {
        id: 'opamp-fleet-id',
        type: 'OPAMP',
        non_identifying_attributes: { 'elastic.display.name': 'my-collector-host' },
        metrics: { cpu_avg: 0.5, memory_size_byte_avg: 512 },
      },
    ]);
    // Verify the query used the display name, not the agent ID
    const otelSearchCall = esClient.search.mock.calls[1][0];
    expect(otelSearchCall.query.bool.must).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ terms: { 'service.instance.id': ['my-collector-host'] } }),
      ])
    );
  });

  it('does not assign metrics to non-reporting OPAMP agents (offline, inactive, unenrolled, uninstalled)', async () => {
    const esClient = {
      search: jest
        .fn()
        .mockResolvedValueOnce({ aggregations: { agents: { buckets: [] } } }) // fleet
        .mockResolvedValueOnce({
          aggregations: {
            agents: {
              buckets: [
                {
                  key: 'my-collector-host',
                  max_memory_size: { value: 512 },
                  avg_cpu: { value: 0.5 },
                },
              ],
            },
          },
        }), // otel — only the online agent
    };
    const agents = [
      {
        id: 'online-agent',
        type: 'OPAMP',
        status: 'online',
        non_identifying_attributes: { 'elastic.display.name': 'my-collector-host' },
      },
      {
        id: 'offline-agent',
        type: 'OPAMP',
        status: 'offline',
        non_identifying_attributes: { 'elastic.display.name': 'my-collector-host' },
      },
      {
        id: 'inactive-agent',
        type: 'OPAMP',
        status: 'inactive',
        non_identifying_attributes: { 'elastic.display.name': 'my-collector-host' },
      },
      {
        id: 'unenrolled-agent',
        type: 'OPAMP',
        status: 'unenrolled',
        non_identifying_attributes: { 'elastic.display.name': 'my-collector-host' },
      },
    ];
    const result = await fetchAndAssignAgentMetrics(esClient as any, agents as any);

    // Only the online agent should receive metrics
    expect(result.find((a) => a.id === 'online-agent')?.metrics).toEqual({
      cpu_avg: 0.5,
      memory_size_byte_avg: 512,
    });
    expect(result.find((a) => a.id === 'offline-agent')?.metrics).toEqual({
      cpu_avg: undefined,
      memory_size_byte_avg: undefined,
    });
    expect(result.find((a) => a.id === 'inactive-agent')?.metrics).toEqual({
      cpu_avg: undefined,
      memory_size_byte_avg: undefined,
    });
    expect(result.find((a) => a.id === 'unenrolled-agent')?.metrics).toEqual({
      cpu_avg: undefined,
      memory_size_byte_avg: undefined,
    });

    // Only the online agent's hostname is queried
    const otelSearchCall = esClient.search.mock.calls[1][0];
    expect(otelSearchCall.query.bool.must).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ terms: { 'service.instance.id': ['my-collector-host'] } }),
      ])
    );
  });

  it('skips the ES query entirely when all OPAMP agents are non-reporting', async () => {
    const esClient = {
      search: jest.fn().mockResolvedValueOnce({ aggregations: { agents: { buckets: [] } } }), // fleet only
    };
    const agents = [
      {
        id: 'offline-agent',
        type: 'OPAMP',
        status: 'offline',
        non_identifying_attributes: { 'elastic.display.name': 'my-collector-host' },
      },
    ];
    const result = await fetchAndAssignAgentMetrics(esClient as any, agents as any);

    expect(result[0].metrics).toBeUndefined();
    // Only the fleet search call fires; no OTel search call
    expect(esClient.search).toHaveBeenCalledTimes(1);
  });

  it('assigns the same metrics bucket to all agents sharing the same elastic.display.name', async () => {
    const esClient = {
      search: jest
        .fn()
        .mockResolvedValueOnce({ aggregations: { agents: { buckets: [] } } })
        .mockResolvedValueOnce({
          aggregations: {
            agents: {
              buckets: [
                { key: 'shared-host', max_memory_size: { value: 768 }, avg_cpu: { value: 0.3 } },
              ],
            },
          },
        }),
    };
    const agents = [
      {
        id: 'opamp-id-1',
        type: 'OPAMP',
        non_identifying_attributes: { 'elastic.display.name': 'shared-host' },
      },
      {
        id: 'opamp-id-2',
        type: 'OPAMP',
        non_identifying_attributes: { 'elastic.display.name': 'shared-host' },
      },
    ];
    const result = await fetchAndAssignAgentMetrics(esClient as any, agents as any);
    expect(result[0].metrics).toEqual({ cpu_avg: 0.3, memory_size_byte_avg: 768 });
    expect(result[1].metrics).toEqual({ cpu_avg: 0.3, memory_size_byte_avg: 768 });
    // Only one unique instanceId should be queried
    const otelSearchCall = esClient.search.mock.calls[1][0];
    expect(otelSearchCall.query.bool.must).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ terms: { 'service.instance.id': ['shared-host'] } }),
      ])
    );
  });
});
