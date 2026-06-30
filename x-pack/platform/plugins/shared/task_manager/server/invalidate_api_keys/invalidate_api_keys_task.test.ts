/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/server';
import { coreMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { TaskManagerPluginsStart, TaskManagerStartContract } from '../plugin';
import { INVALIDATE_API_KEY_SO_NAME, TASK_SO_NAME } from '../saved_objects';
import { runInvalidate } from './lib';
import { taskRunner } from './invalidate_api_keys_task';

jest.mock('./lib', () => ({
  runInvalidate: jest.fn(),
}));

const runInvalidateMock = runInvalidate as jest.Mock;

describe('invalidate api keys task runner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInvalidateMock.mockResolvedValue({ totalInvalidated: 0, missingApiKeyRetries: {} });
  });

  it('builds the saved objects client with the hidden `task` type so the in-use guard works', async () => {
    const coreStart = coreMock.createStart();
    const coreStartServices = jest
      .fn()
      .mockResolvedValue([
        coreStart as CoreStart,
        {} as TaskManagerPluginsStart,
        {} as TaskManagerStartContract,
      ]);

    const runner = taskRunner({
      logger: loggingSystemMock.createLogger(),
      configInterval: '5m',
      coreStartServices,
      getEncryptedSavedObjectsClient: () => undefined,
      invalidateApiKeyFn: jest.fn(),
      invalidateUiamApiKeyFn: () => undefined,
      removalDelay: '1h',
    })({ taskInstance: { state: {} } });

    await runner.run();

    expect(coreStart.savedObjects.createInternalRepository).toHaveBeenCalledWith(
      expect.arrayContaining([INVALIDATE_API_KEY_SO_NAME, TASK_SO_NAME])
    );

    const expectedClient = (coreStart.savedObjects.createInternalRepository as jest.Mock).mock
      .results[0].value;
    expect(runInvalidateMock).toHaveBeenCalledWith(
      expect.objectContaining({ savedObjectsClient: expectedClient })
    );
  });
});
