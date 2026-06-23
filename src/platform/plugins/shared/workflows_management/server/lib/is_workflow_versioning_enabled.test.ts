/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart } from '@kbn/core/server';
import { WORKFLOWS_VERSIONING_SETTING_ID } from '@kbn/workflows/common/constants';

import { readWorkflowVersioningEnabled } from './is_workflow_versioning_enabled';

describe('readWorkflowVersioningEnabled', () => {
  it('reads the global workflows versioning uiSetting', async () => {
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

    expect(coreStart.savedObjects.createInternalRepository).toHaveBeenCalledTimes(1);
    expect(coreStart.uiSettings.globalAsScopedToClient).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(WORKFLOWS_VERSIONING_SETTING_ID);
  });
});
