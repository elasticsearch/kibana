/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { WORKFLOWS_VERSIONING_SETTING_ID } from '../../common/constants';

describe('readWorkflowVersioningEnabled', () => {
  let readWorkflowVersioningEnabled: typeof import('./read_workflow_versioning_enabled').readWorkflowVersioningEnabled;

  beforeEach(async () => {
    jest.resetModules();
    ({ readWorkflowVersioningEnabled } = await import('./read_workflow_versioning_enabled'));
  });

  it('reads the global workflows versioning uiSetting and caches the result', async () => {
    const get = jest.fn().mockResolvedValue(true);
    const coreStart = {
      savedObjects: {
        createInternalRepository: jest.fn().mockReturnValue({}),
      },
      uiSettings: {
        globalAsScopedToClient: jest.fn().mockReturnValue({ get }),
      },
    } as unknown as CoreStart;

    await expect(readWorkflowVersioningEnabled(coreStart)).resolves.toBe(true);
    await expect(readWorkflowVersioningEnabled(coreStart)).resolves.toBe(true);

    expect(coreStart.savedObjects.createInternalRepository).toHaveBeenCalledTimes(1);
    expect(coreStart.uiSettings.globalAsScopedToClient).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(WORKFLOWS_VERSIONING_SETTING_ID);
  });

  it('falls back to false and clears the cache when the uiSettings read fails so a later call can retry', async () => {
    const error = new Error('transient');
    const get = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(true);
    const logger = loggingSystemMock.createLogger();
    const coreStart = {
      savedObjects: {
        createInternalRepository: jest.fn().mockReturnValue({}),
      },
      uiSettings: {
        globalAsScopedToClient: jest.fn().mockReturnValue({ get }),
      },
    } as unknown as CoreStart;

    await expect(readWorkflowVersioningEnabled(coreStart, logger)).resolves.toBe(false);
    await expect(readWorkflowVersioningEnabled(coreStart, logger)).resolves.toBe(true);

    expect(get).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      `Failed to read workflow versioning uiSetting (${WORKFLOWS_VERSIONING_SETTING_ID}); treating workflow versioning as disabled`,
      { error }
    );
  });
});
