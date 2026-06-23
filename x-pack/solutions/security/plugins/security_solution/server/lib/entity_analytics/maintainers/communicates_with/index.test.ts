/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient, KibanaRequest } from '@kbn/core/server';

import { communicatesWithMaintainer } from '.';
import * as engineModule from '../engine/run_relationship_maintainer';

type Ctx = Parameters<typeof communicatesWithMaintainer.run>[0];

describe('communicatesWithMaintainer', () => {
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

  it('calls telemetry.report with funnel and sources but no breakdown', async () => {
    const telemetry = makeTelemetry();
    const ctx = makeContext({ telemetry: telemetry as unknown as Ctx['telemetry'] });

    jest
      .spyOn(engineModule, 'runRelationshipMaintainer')
      .mockImplementation(async ({ telemetryCollector }) => {
        if (telemetryCollector) {
          telemetryCollector.sources.push(
            { id: 'okta', scanned: 5, qualified: 4, outcome: 'producing' },
            { id: 'aws_cloudtrail', scanned: 2, qualified: 2, outcome: 'producing' }
          );
          // communicates_with is a single rel type — collector accumulates it,
          // but the maintainer intentionally does not emit breakdown.
          telemetryCollector.relationshipTypeApplied.communicates_with = 6;
        }
        return {
          totalBuckets: 7,
          totalRecords: 6,
          totalWritten: 6,
          totalNotFound: 0,
          totalWriteErrors: 0,
          totalIterations: 8,
          truncated: false,
          lastRunTimestamp: '2026-05-21T00:00:00.000Z',
        };
      });

    await communicatesWithMaintainer.run(ctx);

    expect(telemetry.report).toHaveBeenCalledTimes(1);
    const [payload] = telemetry.report.mock.calls[0];

    expect(payload.iterations).toBe(8);
    expect(payload.truncated).toBe(false);

    expect(payload.funnel).toEqual({
      scanned: 7,
      qualified: 6,
      proposed: 6,
      applied: 6,
      droppedNotInStore: 0,
      failed: 0,
    });

    expect(payload.sources).toEqual([
      { id: 'okta', scanned: 5, qualified: 4, outcome: 'producing' },
      { id: 'aws_cloudtrail', scanned: 2, qualified: 2, outcome: 'producing' },
    ]);

    expect(payload).not.toHaveProperty('breakdown');
  });
});
