/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getMeta } from '@kbn/as-code-shared-schemas';
import type { SavedObject, SavedObjectsUpdateResponse } from '@kbn/core/server';
import type { StoredMarkdownState } from '../markdown_saved_object';
import { markdownLibraryItemSchema } from './schema';

// CRU is Create, Read, Update
export function getMarkdownCRUResponseBody(
  savedObject: SavedObject<StoredMarkdownState> | SavedObjectsUpdateResponse<StoredMarkdownState>
) {
  return {
    id: savedObject.id,
    // Route does not apply defaults to response
    // Instead, call validate to ensure defaults are applied to response
    data: markdownLibraryItemSchema.validate(savedObject.attributes),
    meta: getMeta(savedObject),
  };
}
