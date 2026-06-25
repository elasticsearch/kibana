/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createCoreSetupMock } from '@kbn/core-lifecycle-server-mocks/src/core_setup.mock';
import {
  WORKFLOWS_UI_SETTING_ID,
  WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID,
  WORKFLOWS_VERSIONING_SETTING_ID,
} from '@kbn/workflows';
import type { WorkflowsServerPluginSetupDeps } from './types';
import { registerUISettings } from './ui_settings';

describe('Workflows Management UI Settings', () => {
  let coreSetupMock: ReturnType<typeof createCoreSetupMock>;

  beforeEach(() => {
    coreSetupMock = createCoreSetupMock();
  });

  it('should register workflows UI settings', () => {
    registerUISettings(coreSetupMock, {} as WorkflowsServerPluginSetupDeps);

    expect(coreSetupMock.uiSettings.register).toHaveBeenCalledWith(
      expect.objectContaining({
        [WORKFLOWS_UI_SETTING_ID]: {
          description: expect.any(String),
          name: expect.any(String),
          schema: expect.any(Object),
          value: true,
          readonly: false,
          requiresPageReload: true,
          category: ['workflows'],
        },
        [WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID]: {
          description: expect.any(String),
          name: expect.any(String),
          schema: expect.any(Object),
          value: false,
          readonly: false,
          category: ['workflows'],
        },
      })
    );
  });

  it('should register UI settings only once', () => {
    registerUISettings(coreSetupMock, {} as WorkflowsServerPluginSetupDeps);

    expect(coreSetupMock.uiSettings.register).toHaveBeenCalledTimes(1);
    expect(coreSetupMock.uiSettings.registerGlobal).toHaveBeenCalledTimes(1);
  });

  it('should register hidden workflow change history ui setting as global', () => {
    registerUISettings(coreSetupMock, {} as WorkflowsServerPluginSetupDeps);

    expect(coreSetupMock.uiSettings.registerGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        [WORKFLOWS_VERSIONING_SETTING_ID]: expect.objectContaining({
          schema: expect.any(Object),
          value: false,
          readonly: true,
          readonlyMode: 'ui',
          requiresPageReload: true,
          scope: 'global',
        }),
      })
    );
  });

  it('should include license text if serverless is false', () => {
    registerUISettings(coreSetupMock, {} as WorkflowsServerPluginSetupDeps);

    expect(coreSetupMock.uiSettings.register).toHaveBeenCalledWith(
      expect.objectContaining({
        [WORKFLOWS_UI_SETTING_ID]: expect.objectContaining({
          description: expect.stringContaining('Requires <b>enterprise</b> license'),
        }),
      })
    );
  });

  it('should not include license text if serverless is true', () => {
    registerUISettings(coreSetupMock, { serverless: {} } as WorkflowsServerPluginSetupDeps);

    expect(coreSetupMock.uiSettings.register).toHaveBeenCalledWith(
      expect.objectContaining({
        [WORKFLOWS_UI_SETTING_ID]: expect.objectContaining({
          description: expect.not.stringContaining('Requires <b>enterprise</b> license'),
        }),
      })
    );
  });

  it('should register managed workflow visibility setting copy', () => {
    registerUISettings(coreSetupMock, {} as WorkflowsServerPluginSetupDeps);

    expect(coreSetupMock.uiSettings.register).toHaveBeenCalledWith(
      expect.objectContaining({
        [WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID]: expect.objectContaining({
          name: 'Show managed workflows',
          description: expect.stringContaining(
            'Allows users with the required workflow privileges to display managed workflows and their executions in workflow experiences.'
          ),
        }),
      })
    );
    expect(coreSetupMock.uiSettings.register).toHaveBeenCalledWith(
      expect.objectContaining({
        [WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID]: expect.objectContaining({
          description: expect.stringContaining(
            'Editing, disabling, or deleting them may cause unexpected behavior or break product functionality.'
          ),
        }),
      })
    );
  });
});
