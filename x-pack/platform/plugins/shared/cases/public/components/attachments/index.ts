/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UnifiedAttachmentTypeRegistry } from '../../client/attachment_framework/unified_attachment_registry';
import { getCommentAttachmentType } from './comment';
import { getDashboardAttachmentType } from './dashboard';
import { getDiscoverSessionAttachmentType } from './discover_session';
import { getFileAttachmentType } from './file';
import { getMapAttachmentType } from './map';
import { getVisualizationAttachmentType } from './lens';
import { getStackAlertAttachmentType } from './alert';

export interface RegisterInternalAttachmentsOptions {
  hasDashboardPluginEnabled?: boolean;
  hasMapsPluginEnabled?: boolean;
}

export const registerInternalAttachments = (
  unifiedRegistry: UnifiedAttachmentTypeRegistry,
  {
    hasDashboardPluginEnabled = false,
    hasMapsPluginEnabled = false,
  }: RegisterInternalAttachmentsOptions = {}
) => {
  unifiedRegistry.register(getFileAttachmentType());
  unifiedRegistry.register(getVisualizationAttachmentType());
  unifiedRegistry.register(getCommentAttachmentType());
  unifiedRegistry.register(getStackAlertAttachmentType());
  unifiedRegistry.register(getDiscoverSessionAttachmentType());
  if (hasDashboardPluginEnabled) {
    unifiedRegistry.register(getDashboardAttachmentType());
  }
  if (hasMapsPluginEnabled) {
    unifiedRegistry.register(getMapAttachmentType());
  }
};
