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

/**
 * Reads the global workflow versioning gate once at Kibana startup.
 * The uiSetting is registered with `requiresPageReload: true`, so the value is
 * frozen for the process lifetime after WorkflowsService initializes.
 */
export const readWorkflowVersioningEnabled = async (coreStart: CoreStart): Promise<boolean> => {
  const savedObjectsClient = coreStart.savedObjects.createInternalRepository();
  const uiSettingsClient = coreStart.uiSettings.globalAsScopedToClient(savedObjectsClient);
  return uiSettingsClient.get<boolean>(WORKFLOWS_VERSIONING_SETTING_ID);
};
