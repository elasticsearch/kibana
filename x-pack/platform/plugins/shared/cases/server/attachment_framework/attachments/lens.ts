/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LensAttachmentPayloadSchema } from '../../../common/types/domain_zod/attachment/lens/v2';
import type { UnifiedAttachmentTypeSetup } from '../types';
import { LENS_ATTACHMENT_TYPE } from '../../../common/constants/attachments';

export const lensAttachmentType: UnifiedAttachmentTypeSetup = {
  id: LENS_ATTACHMENT_TYPE,
  schema: LensAttachmentPayloadSchema,
  // `data.state` is the embeddable input bag, produced by the "Add to case"
  // flow and not authorable in YAML, so lens is excluded from workflow steps.
  workflowSchema: false,
};
