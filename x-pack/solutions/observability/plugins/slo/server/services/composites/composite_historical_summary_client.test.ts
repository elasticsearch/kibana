/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import type { FetchHistoricalSummaryResponse } from '@kbn/slo-schema';
import { createSLO, createAPMTransactionErrorRateIndicator } from '../fixtures/slo';
import { createCompositeSlo } from '../fixtures/composite_slo';
import { Duration, DurationUnit } from '../../domain/models';
import { CompositeHistoricalSummaryClient } from './composite_historical_summary_client';
import type { HistoricalSummaryProvider } from './composite_historical_summary_client';
import { createCompositeSLORepositoryMock, createSLORepositoryMock } from '../mocks';
import type { CompositeSLORepository } from './composite_slo_repository';
import type { SLODefinitionRepository } from '../slo_definition_repository';

const buildHistoricalPoint = (date: string, sliValue: number, status: string = 'HEALTHY') => ({
  date,
  sliValue,
  status,
  errorBudget: { initial: 0.01, consumed: 0, remaining: 1, isEstimated: false },
});

describe('CompositeHistoricalSummaryClient', () => {
  let mockCompositeRepo: jest.Mocked<CompositeSLORepository>;
  let mockSloRepo: jest.Mocked<SLODefinitionRepository>;
  let mockHistoricalProvider: jest.Mocked<HistoricalSummaryProvider>;
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;

  beforeEach(() => {
    mockCompositeRepo = createCompositeSLORepositoryMock();
    mockSloRepo = createSLORepositoryMock();
    mockHistoricalProvider = { fetch: jest.fn() };
    esClient = elasticsearchServiceMock.createElasticsearchClient();
  });

  const createClient = () =>
    new CompositeHistoricalSummaryClient(
      esClient,
      mockCompositeRepo,
      mockSloRepo,
      'default',
      mockHistoricalProvider
    );

  it('computes weighted historical SLI across members', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      name: 'Service A',
      indicator: createAPMTransactionErrorRateIndicator(),
    });
    const sloB = createSLO({
      id: 'slo-b',
      name: 'Service B',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const composite = createCompositeSlo({
      members: [
        { sloId: sloA.id, weight: 3 },
        { sloId: sloB.id, weight: 7 },
      ],
      objective: { target: 0.99 },
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA, sloB]);

    mockHistoricalProvider.fetch.mockResolvedValue([
      {
        sloId: sloA.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', 0.99), buildHistoricalPoint('2024-01-02', 0.98)],
      },
      {
        sloId: sloB.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', 0.995), buildHistoricalPoint('2024-01-02', 0.99)],
      },
    ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    const result = await client.fetch({ list: [composite.id] });

    expect(result).toHaveLength(1);
    expect(result[0].compositeId).toBe(composite.id);
    expect(result[0].data).toHaveLength(2);

    // Day 1: (3*0.99 + 7*0.995) / 10 = (2.97 + 6.965) / 10 = 0.9935
    expect(result[0].data[0].sliValue).toBeCloseTo(0.9935, 4);
    expect(result[0].data[0].date).toBe('2024-01-01');

    // Day 2: (3*0.98 + 7*0.99) / 10 = (2.94 + 6.93) / 10 = 0.987
    expect(result[0].data[1].sliValue).toBeCloseTo(0.987, 4);
    expect(result[0].data[1].date).toBe('2024-01-02');
  });

  it('computes error budget based on composite objective', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const composite = createCompositeSlo({
      members: [{ sloId: sloA.id, weight: 1 }],
      objective: { target: 0.99 },
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA]);

    mockHistoricalProvider.fetch.mockResolvedValue([
      {
        sloId: sloA.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', 0.995)],
      },
    ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    const result = await client.fetch({ list: [composite.id] });

    // initial = 1 - 0.99 = 0.01, consumed = (1 - 0.995) / 0.01 = 0.5
    expect(result[0].data[0].errorBudget.initial).toBeCloseTo(0.01, 4);
    expect(result[0].data[0].errorBudget.consumed).toBeCloseTo(0.5, 4);
    expect(result[0].data[0].errorBudget.remaining).toBeCloseTo(0.5, 4);
  });

  it('returns NO_DATA for dates where no member has data', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      indicator: createAPMTransactionErrorRateIndicator(),
    });
    const sloB = createSLO({
      id: 'slo-b',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const composite = createCompositeSlo({
      members: [
        { sloId: sloA.id, weight: 1 },
        { sloId: sloB.id, weight: 1 },
      ],
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA, sloB]);

    mockHistoricalProvider.fetch.mockResolvedValue([
      {
        sloId: sloA.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', -1, 'NO_DATA')],
      },
      {
        sloId: sloB.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', -1, 'NO_DATA')],
      },
    ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    const result = await client.fetch({ list: [composite.id] });

    expect(result[0].data[0].sliValue).toBe(-1);
    expect(result[0].data[0].status).toBe('NO_DATA');
  });

  it('skips members with NO_DATA and re-normalises weights for that date', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      indicator: createAPMTransactionErrorRateIndicator(),
    });
    const sloB = createSLO({
      id: 'slo-b',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const composite = createCompositeSlo({
      members: [
        { sloId: sloA.id, weight: 3 },
        { sloId: sloB.id, weight: 7 },
      ],
      objective: { target: 0.99 },
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA, sloB]);

    mockHistoricalProvider.fetch.mockResolvedValue([
      {
        sloId: sloA.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', 0.995)],
      },
      {
        sloId: sloB.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', -1, 'NO_DATA')],
      },
    ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    const result = await client.fetch({ list: [composite.id] });

    // Only sloA has data, totalWeight = 3, sli = 3 * 0.995 / 3 = 0.995
    expect(result[0].data[0].sliValue).toBeCloseTo(0.995, 4);
  });

  it('skips deleted members that no longer exist', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const composite = createCompositeSlo({
      members: [
        { sloId: sloA.id, weight: 1 },
        { sloId: 'deleted-slo', weight: 2 },
      ],
      objective: { target: 0.99 },
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA]);

    mockHistoricalProvider.fetch.mockResolvedValue([
      {
        sloId: sloA.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', 0.995)],
      },
    ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    const result = await client.fetch({ list: [composite.id] });

    expect(result[0].data).toHaveLength(1);
    expect(result[0].data[0].sliValue).toBeCloseTo(0.995, 4);
  });

  it('returns empty data when composite has no active members', async () => {
    const composite = createCompositeSlo({
      members: [
        { sloId: 'deleted-a', weight: 1 },
        { sloId: 'deleted-b', weight: 1 },
      ],
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([]);

    const client = createClient();
    const result = await client.fetch({ list: [composite.id] });

    expect(result[0].data).toHaveLength(0);
    expect(mockHistoricalProvider.fetch).not.toHaveBeenCalled();
  });

  it('passes member budgetingMethod to the historical summary provider', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      budgetingMethod: 'timeslices',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const composite = createCompositeSlo({
      members: [{ sloId: sloA.id, weight: 1 }],
      budgetingMethod: 'occurrences',
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA]);
    mockHistoricalProvider.fetch.mockResolvedValue([
      {
        sloId: sloA.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', 0.99)],
      },
    ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    await client.fetch({ list: [composite.id] });

    expect(mockHistoricalProvider.fetch).toHaveBeenCalledWith({
      list: [
        expect.objectContaining({
          sloId: sloA.id,
          budgetingMethod: 'timeslices',
        }),
      ],
    });
  });

  it('handles multiple composites in a single fetch', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      indicator: createAPMTransactionErrorRateIndicator(),
    });
    const sloB = createSLO({
      id: 'slo-b',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const compositeOne = createCompositeSlo({
      id: 'comp-1',
      members: [{ sloId: sloA.id, weight: 1 }],
      objective: { target: 0.99 },
    });
    const compositeTwo = createCompositeSlo({
      id: 'comp-2',
      members: [{ sloId: sloB.id, weight: 1 }],
      objective: { target: 0.95 },
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([compositeOne, compositeTwo]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA, sloB]);

    mockHistoricalProvider.fetch
      .mockResolvedValueOnce([
        {
          sloId: sloA.id,
          instanceId: '*',
          data: [buildHistoricalPoint('2024-01-01', 0.995)],
        },
      ] as FetchHistoricalSummaryResponse)
      .mockResolvedValueOnce([
        {
          sloId: sloB.id,
          instanceId: '*',
          data: [buildHistoricalPoint('2024-01-01', 0.96)],
        },
      ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    const result = await client.fetch({ list: ['comp-1', 'comp-2'] });

    expect(result).toHaveLength(2);
    expect(result[0].compositeId).toBe('comp-1');
    expect(result[0].data[0].sliValue).toBeCloseTo(0.995, 4);
    expect(result[1].compositeId).toBe('comp-2');
    expect(result[1].data[0].sliValue).toBeCloseTo(0.96, 4);
  });

  it('aligns dates across members with different date coverage', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      indicator: createAPMTransactionErrorRateIndicator(),
    });
    const sloB = createSLO({
      id: 'slo-b',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const composite = createCompositeSlo({
      members: [
        { sloId: sloA.id, weight: 1 },
        { sloId: sloB.id, weight: 1 },
      ],
      objective: { target: 0.99 },
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA, sloB]);

    mockHistoricalProvider.fetch.mockResolvedValue([
      {
        sloId: sloA.id,
        instanceId: '*',
        data: [
          buildHistoricalPoint('2024-01-01', 0.99),
          buildHistoricalPoint('2024-01-02', 0.98),
          buildHistoricalPoint('2024-01-03', 0.97),
        ],
      },
      {
        sloId: sloB.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-02', 0.995)],
      },
    ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    const result = await client.fetch({ list: [composite.id] });

    expect(result[0].data).toHaveLength(3);

    // Day 1: only sloA has data → sli = 0.99
    expect(result[0].data[0].sliValue).toBeCloseTo(0.99, 4);
    // Day 2: both have data → (1*0.98 + 1*0.995) / 2 = 0.9875
    expect(result[0].data[1].sliValue).toBeCloseTo(0.9875, 4);
    // Day 3: only sloA → sli = 0.97
    expect(result[0].data[2].sliValue).toBeCloseTo(0.97, 4);
  });

  it('passes composite timeWindow to the historical summary provider', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const composite = createCompositeSlo({
      members: [{ sloId: sloA.id, weight: 1 }],
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA]);
    mockHistoricalProvider.fetch.mockResolvedValue([
      {
        sloId: sloA.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', 0.99)],
      },
    ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    await client.fetch({ list: [composite.id] });

    expect(mockHistoricalProvider.fetch).toHaveBeenCalledWith({
      list: [
        expect.objectContaining({
          timeWindow: {
            duration: new Duration(30, DurationUnit.Day),
            type: 'rolling',
          },
        }),
      ],
    });
  });

  it('returns VIOLATED status when composite SLI drops below target', async () => {
    const sloA = createSLO({
      id: 'slo-a',
      indicator: createAPMTransactionErrorRateIndicator(),
    });

    const composite = createCompositeSlo({
      members: [{ sloId: sloA.id, weight: 1 }],
      objective: { target: 0.999 },
    });

    mockCompositeRepo.findAllByIds.mockResolvedValue([composite]);
    mockSloRepo.findAllByIds.mockResolvedValue([sloA]);

    mockHistoricalProvider.fetch.mockResolvedValue([
      {
        sloId: sloA.id,
        instanceId: '*',
        data: [buildHistoricalPoint('2024-01-01', 0.95)],
      },
    ] as FetchHistoricalSummaryResponse);

    const client = createClient();
    const result = await client.fetch({ list: [composite.id] });

    expect(result[0].data[0].status).toBe('VIOLATED');
    expect(result[0].data[0].errorBudget.remaining).toBeLessThan(0);
  });
});
