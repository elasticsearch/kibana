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
import type { StoredLinksState } from '../links_saved_object';
import { linksApiStateSchema } from './schemas';
import { transformOut } from '../../common/api/transforms';

// CRU is Create, Read, Update
export function getLinksCRUResponseBody(
  savedObject: SavedObject<StoredLinksState> | SavedObjectsUpdateResponse<StoredLinksState>
) {
  const transformedState = transformOut(
    { title: '', ...savedObject.attributes },
    savedObject.references
  );
  return {
    id: savedObject.id,
    // Route does not apply defaults to response
    // Instead, call validate to ensure defaults are applied to response
    data: linksApiStateSchema.validate(
      Object.fromEntries(
        Object.entries(transformedState).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // sort keys of response
      )
    ),
    meta: getMeta(savedObject),
  };
}
