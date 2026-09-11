/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObject } from '@kbn/core-saved-objects-common';
import type { AsCodeMeta } from './schema';

export function getMeta(
  savedObject: Pick<
    SavedObject,
    | 'created_at'
    | 'created_by'
    | 'managed'
    | 'accessControl'
    | 'updated_at'
    | 'updated_by'
    | 'version'
  >
): AsCodeMeta {
  return {
    ...(savedObject.created_at && { created_at: savedObject.created_at }),
    ...(savedObject.created_by && { created_by: savedObject.created_by }),
    managed: savedObject.managed ?? false,
    ...(savedObject.accessControl?.owner && { owner: savedObject.accessControl.owner }),
    ...(savedObject.updated_at && { updated_at: savedObject.updated_at }),
    ...(savedObject.updated_by && { updated_by: savedObject.updated_by }),
    ...(savedObject.version && { version: savedObject.version }),
  };
}
