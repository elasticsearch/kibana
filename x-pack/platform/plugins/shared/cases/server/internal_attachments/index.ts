/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UnifiedAttachmentTypeRegistry } from '../attachment_framework/unified_attachment_registry';
import {
  commentAttachmentType,
  lensAttachmentType,
  stackAlertAttachmentType,
  fileAttachmentType,
  dashboardAttachmentType,
  mapAttachmentType,
  discoverSessionAttachmentType,
} from '../attachment_framework/attachments';

export const registerInternalAttachments = (unifiedRegistry: UnifiedAttachmentTypeRegistry) => {
  unifiedRegistry.register(fileAttachmentType);
  unifiedRegistry.register(lensAttachmentType);
  unifiedRegistry.register(commentAttachmentType);
  unifiedRegistry.register(stackAlertAttachmentType);
  unifiedRegistry.register(dashboardAttachmentType);
  unifiedRegistry.register(mapAttachmentType);
  unifiedRegistry.register(discoverSessionAttachmentType);
};
