/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export type RemoteLogExtractionState = z.infer<typeof RemoteLogExtractionState>;
export const RemoteLogExtractionState = z.object({
  checkpointTimestamp: z.string().nullable().default(null),
  paginationRecoveryId: z.string().nullable().default(null),
});
