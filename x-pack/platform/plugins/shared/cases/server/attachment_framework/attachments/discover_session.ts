/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DiscoverSessionAttachmentPayloadSchema } from '../../../common/types/domain_zod/attachment/saved_object/v2';
import { DISCOVER_SESSION_ATTACHMENT_TYPE } from '../../../common/constants/attachments';
import type { UnifiedAttachmentTypeSetup } from '../types';

export const discoverSessionAttachmentType: UnifiedAttachmentTypeSetup = {
  id: DISCOVER_SESSION_ATTACHMENT_TYPE,
  schema: DiscoverSessionAttachmentPayloadSchema,
};
