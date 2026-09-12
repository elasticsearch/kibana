/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UnifiedAttachmentTypeSetup } from '@kbn/cases-plugin/server';
import { SECURITY_ALERT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { SecurityAlertAttachmentPayloadSchema } from '../../../common/cases/attachments/alert';
import { validateAlertWorkflowTargets } from './workflow_validation';

export const securityAlertAttachmentType: UnifiedAttachmentTypeSetup = {
  id: SECURITY_ALERT_ATTACHMENT_TYPE,
  schema: SecurityAlertAttachmentPayloadSchema,
  workflow: { validateTargets: validateAlertWorkflowTargets },
};
