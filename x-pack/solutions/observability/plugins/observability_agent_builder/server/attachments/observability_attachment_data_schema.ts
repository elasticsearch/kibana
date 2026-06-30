/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { MAX_SHORT_STRING_LENGTH } from '../utils/schema_limits';

/**
 * Base schema for all Observability agent-builder attachments.
 * Each attachment can override its UI label by providing an `attachmentLabel`,
 */
export const observabilityAttachmentDataSchema = z.object({
  attachmentLabel: z.string().max(MAX_SHORT_STRING_LENGTH).optional(),
});
