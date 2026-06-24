/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MapAttachmentPayloadSchema } from '../../../common/types/domain_zod/attachment/map/v2';
import type { UnifiedAttachmentTypeSetup } from '../types';
import { MAP_ATTACHMENT_TYPE } from '../../../common/constants/attachments';

export const mapAttachmentType: UnifiedAttachmentTypeSetup = {
  id: MAP_ATTACHMENT_TYPE,
  schema: MapAttachmentPayloadSchema,
};
