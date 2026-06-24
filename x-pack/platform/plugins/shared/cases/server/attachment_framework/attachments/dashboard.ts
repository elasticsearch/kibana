/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DashboardAttachmentPayloadSchema } from '../../../common/types/domain_zod/attachment/dashboard/v2';
import type { UnifiedAttachmentTypeSetup } from '../types';
import { DASHBOARD_ATTACHMENT_TYPE } from '../../../common/constants/attachments';

export const dashboardAttachmentType: UnifiedAttachmentTypeSetup = {
  id: DASHBOARD_ATTACHMENT_TYPE,
  schema: DashboardAttachmentPayloadSchema,
};
