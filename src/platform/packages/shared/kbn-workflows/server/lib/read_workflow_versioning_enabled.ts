/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreStart, Logger } from '@kbn/core/server';
import { WORKFLOWS_VERSIONING_SETTING_ID } from '../../common/constants';

/**
 * Reads the global workflow versioning gate; cached for process lifetime because the
 * uiSetting is registered with `requiresPageReload: true`.
 */
let readWorkflowVersioningEnabledPromise: Promise<boolean> | undefined;

export const readWorkflowVersioningEnabled = (
  coreStart: CoreStart,
  logger?: Logger
): Promise<boolean> => {
  if (!readWorkflowVersioningEnabledPromise) {
    readWorkflowVersioningEnabledPromise = (async () => {
      const savedObjectsClient = coreStart.savedObjects.createInternalRepository();
      const uiSettingsClient = coreStart.uiSettings.globalAsScopedToClient(savedObjectsClient);
      return uiSettingsClient.get<boolean>(WORKFLOWS_VERSIONING_SETTING_ID);
    })().catch((error) => {
      readWorkflowVersioningEnabledPromise = undefined;
      logger?.warn(
        `Failed to read workflow versioning uiSetting (${WORKFLOWS_VERSIONING_SETTING_ID}); treating workflow versioning as disabled`,
        { error }
      );
      return false;
    });
  }

  return readWorkflowVersioningEnabledPromise;
};
