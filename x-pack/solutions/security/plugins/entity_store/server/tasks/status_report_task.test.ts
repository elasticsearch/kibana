/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import { loggerMock, type MockedLogger } from '@kbn/logging-mocks';

import { registerStatusReportTask } from './status_report_task';
import { createAssetManagerClient } from './factories';
import { ENTITY_STORE_METADATA_USAGE_EVENT } from '../telemetry/events';
import { ENTITY_STORE_STATUS } from '../domain/constants';
import { getMetadataEntitiesDataStreamName } from '../domain/asset_manager/metadata_data_stream';
import type { EntityStoreCoreSetup } from '../types';

jest.mock('./factories');
// wrapTaskRun adds a tracing span around the run callback; here it just invokes it.
jest.mock('../telemetry/traces', () => ({
  wrapTaskRun: jest.fn(({ run }: { run: () => Promise<unknown> }) => run()),
}));

const createAssetManagerClientMock = createAssetManagerClient as jest.Mock;

const NAMESPACE = 'default';
const METADATA_INDEX = getMetadataEntitiesDataStreamName(NAMESPACE);

describe('status report task — metadata usage telemetry', () => {
  let logger: MockedLogger;
  let reportEvent: jest.Mock;
  let count: jest.Mock;
  let getStatus: jest.Mock;

  // Drives the task the way task-manager does: register, grab the definition,
  // build the runner and run it once.
  const runStatusReportTask = async () => {
    const taskManager = {
      registerTaskDefinitions: jest.fn(),
    } as unknown as TaskManagerSetupContract;
    const core = { analytics: { reportEvent } } as unknown as EntityStoreCoreSetup;

    registerStatusReportTask({ taskManager, logger, core });

    const [definitions] = (taskManager.registerTaskDefinitions as jest.Mock).mock.calls[0];
    const [taskType] = Object.keys(definitions);
    const runner = definitions[taskType].createTaskRunner({
      taskInstance: { id: `status:${NAMESPACE}`, state: { namespace: NAMESPACE } },
      fakeRequest: {},
      abortController: new AbortController(),
    });
    return runner.run();
  };

  beforeEach(() => {
    jest.clearAllMocks();
    logger = loggerMock.create();
    reportEvent = jest.fn();
    getStatus = jest.fn().mockResolvedValue({ status: ENTITY_STORE_STATUS.NOT_INSTALLED });
    // Store-usage counts carry a `query`; the metadata-datastream count does not.
    count = jest.fn(async (params: { query?: unknown }) =>
      params.query ? { count: 5 } : { count: 42 }
    );

    createAssetManagerClientMock.mockResolvedValue({
      assetManagerClient: { getStatus },
      esClient: { count } as unknown as ElasticsearchClient,
    });
  });

  it('reports the metadata datastream doc count when the datastream exists', async () => {
    await runStatusReportTask();

    expect(reportEvent).toHaveBeenCalledWith(ENTITY_STORE_METADATA_USAGE_EVENT.eventType, {
      namespace: NAMESPACE,
      docCount: 42,
    });
  });

  it('counts the namespace-scoped metadata datastream with the abort signal', async () => {
    await runStatusReportTask();

    const metadataCountCall = count.mock.calls.find(([params]) => !params.query);
    expect(metadataCountCall).toBeDefined();
    expect(metadataCountCall![0]).toEqual({ index: METADATA_INDEX });
    expect(metadataCountCall![1]).toEqual({ signal: expect.any(AbortSignal) });
  });

  it('does not report metadata usage and does not throw when the datastream is absent (v2 FF off)', async () => {
    count.mockImplementation(async (params: { query?: unknown }) => {
      if (params.query) return { count: 5 };
      throw new Error('index_not_found_exception');
    });

    await expect(runStatusReportTask()).resolves.toEqual({ state: { namespace: NAMESPACE } });

    const reportedMetadata = reportEvent.mock.calls.some(
      ([eventType]) => eventType === ENTITY_STORE_METADATA_USAGE_EVENT.eventType
    );
    expect(reportedMetadata).toBe(false);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Metadata datastream not present')
    );
  });
});
