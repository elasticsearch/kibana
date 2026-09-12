/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UnifiedAttachmentTypeSetup } from '@kbn/cases-plugin/server';
import { SECURITY_EVENT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { SecurityEventAttachmentPayloadSchema } from '../../../common/cases/attachments/event';
import { validateEventWorkflowTargets } from './workflow_validation';

/**
 * Server-side `security.event` unified attachment registration. The cases
 * plugin validates the full payload against `SecurityEventAttachmentPayloadSchema`
 * at every write boundary (add / bulk_create / update / add_file).
 */
export const getEventAttachmentType = (): UnifiedAttachmentTypeSetup => ({
  id: SECURITY_EVENT_ATTACHMENT_TYPE,
  schema: SecurityEventAttachmentPayloadSchema,
  workflow: { validateTargets: validateEventWorkflowTargets },
});
