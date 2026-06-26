/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildAddAttachmentStepCommonDefinition } from '../../common/workflows/steps/add_attachment';
import { buildAddAttachmentsStepCommonDefinition } from '../../common/workflows/steps/add_attachments';
import { selectWorkflowAttachmentSchemas } from '../../common/workflows/steps/workflow_attachment_schemas';
import type { UnifiedAttachmentTypeRegistry } from '../client/attachment_framework/unified_attachment_registry';
import { createPublicCaseStepDefinition } from './shared';

export const getAddAttachmentStepDefinition = (registry: UnifiedAttachmentTypeRegistry) => {
  const members = selectWorkflowAttachmentSchemas(registry.list());
  // No authorable type registered: skip the step rather than composing an empty union.
  if (members.length === 0) {
    return undefined;
  }
  return createPublicCaseStepDefinition({
    ...buildAddAttachmentStepCommonDefinition(members),
  });
};

export const getAddAttachmentsStepDefinition = (registry: UnifiedAttachmentTypeRegistry) => {
  const members = selectWorkflowAttachmentSchemas(registry.list());
  if (members.length === 0) {
    return undefined;
  }
  return createPublicCaseStepDefinition({
    ...buildAddAttachmentsStepCommonDefinition(members),
  });
};
