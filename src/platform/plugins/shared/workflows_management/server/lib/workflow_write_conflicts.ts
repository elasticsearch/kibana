/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isElasticsearchWriteConflict, isOccConflictError } from '@kbn/occ';
import { isWorkflowConflictError } from '@kbn/workflows-yaml';

export const isRetryableWorkflowWriteConflict = (error: unknown): boolean => {
  if (isOccConflictError(error) || isElasticsearchWriteConflict(error)) {
    return true;
  }

  return error instanceof Error && isWorkflowConflictError(error);
};
