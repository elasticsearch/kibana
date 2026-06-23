/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient, KibanaRequest } from '@kbn/core/server';

import { accessesFrequentlyMaintainer } from '.';
import * as engineModule from '../engine/run_relationship_maintainer';

type Ctx = Parameters<typeof accessesFrequentlyMaintainer.run>[0];

describe('accessesFrequentlyMaintainer', () => {
  const makeTelemetry = () => ({ report: jest.fn() });

  const makeContext = (overrides: Partial<Ctx> = {}): Ctx =>
    ({
      status: {
        metadata: {
          namespace: 'default',
          runs: 0,
          lastSuccessTimestamp: null,
          lastErrorTimestamp: null,
        },
        state: {},
        taskStatus: 'started',
      },
      abortController: new AbortController(),
      logger: loggerMock.create(),
      fakeRequest: {} as KibanaRequest,
      esClient: {} as ElasticsearchClient,
      crudClient: {} as never,
      telemetry: makeTelemetry(),
      ...overrides,
    } as unknown as Ctx);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls telemetry.report with funnel, sources, and breakdown', async () => {
    const telemetry = makeTelemetry();
    const ctx = makeContext({ telemetry: telemetry as unknown as Ctx['telemetry'] });

    jest
      .spyOn(engineModule, 'runRelationshipMaintainer')
      .mockImplementation(async ({ telemetryCollector }) => {
        if (telemetryCollector) {
          telemetryCollector.sources.push(
            { id: 'elastic_defend', scanned: 10, qualified: 8, outcome: 'producing' },
            { id: 'aws_cloudtrail', scanned: 0, qualified: 0, outcome: 'index_missing' }
          );
          telemetryCollector.relationshipTypeApplied.accesses_frequently = 5;
          telemetryCollector.relationshipTypeApplied.accesses_infrequently = 3;
        }
        return {
          totalBuckets: 10,
          totalRecords: 8,
          totalWritten: 8,
          totalNotFound: 0,
          totalWriteErrors: 0,
          totalIterations: 15,
          truncated: false,
          lastRunTimestamp: '2026-05-21T00:00:00.000Z',
        };
      });

    await accessesFrequentlyMaintainer.run(ctx);

    expect(telemetry.report).toHaveBeenCalledTimes(1);
    const [payload] = telemetry.report.mock.calls[0];

    expect(payload.iterations).toBe(15);
    expect(payload.truncated).toBe(false);

    expect(payload.funnel).toEqual({
      scanned: 10,
      qualified: 8,
      proposed: 8, // echoes qualified — engine has no distinct proposal stage
      applied: 8,
      droppedNotInStore: 0,
      failed: 0,
    });

    expect(payload.sources).toEqual([
      { id: 'elastic_defend', scanned: 10, qualified: 8, outcome: 'producing' },
      { id: 'aws_cloudtrail', scanned: 0, qualified: 0, outcome: 'index_missing' },
    ]);

    expect(payload.breakdown).toEqual([
      { name: 'accesses_frequently', count: 5 },
      { name: 'accesses_infrequently', count: 3 },
    ]);
  });

  it('omits breakdown from the report when no writes succeeded', async () => {
    const telemetry = makeTelemetry();
    const ctx = makeContext({ telemetry: telemetry as unknown as Ctx['telemetry'] });

    jest
      .spyOn(engineModule, 'runRelationshipMaintainer')
      .mockImplementation(async ({ telemetryCollector }) => {
        if (telemetryCollector) {
          telemetryCollector.sources.push({
            id: 'elastic_defend',
            scanned: 0,
            qualified: 0,
            outcome: 'index_missing',
          });
          // relationshipTypeApplied intentionally empty
        }
        return {
          totalBuckets: 0,
          totalRecords: 0,
          totalWritten: 0,
          totalNotFound: 0,
          totalWriteErrors: 0,
          totalIterations: 2,
          truncated: false,
          lastRunTimestamp: '2026-05-21T00:00:00.000Z',
        };
      });

    await accessesFrequentlyMaintainer.run(ctx);

    const [payload] = telemetry.report.mock.calls[0];
    expect(payload).not.toHaveProperty('breakdown');
  });

  it('passes abortController to runRelationshipMaintainer', async () => {
    const telemetry = makeTelemetry();
    const ac = new AbortController();
    const ctx = makeContext({
      telemetry: telemetry as unknown as Ctx['telemetry'],
      abortController: ac,
    });

    const spy = jest.spyOn(engineModule, 'runRelationshipMaintainer').mockResolvedValue({
      totalBuckets: 0,
      totalRecords: 0,
      totalWritten: 0,
      totalNotFound: 0,
      totalWriteErrors: 0,
      totalIterations: 1,
      truncated: false,
      lastRunTimestamp: '2026-05-21T00:00:00.000Z',
    });

    await accessesFrequentlyMaintainer.run(ctx);

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ abortController: ac }));
  });
});
