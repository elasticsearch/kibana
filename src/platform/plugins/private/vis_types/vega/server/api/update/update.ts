/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { SavedObjectsErrorHelpers, type RequestHandlerContext } from '@kbn/core/server';
import { VEGA_SAVED_OBJECT_TYPE } from '../../../common/constants';
import { getVegaCRUResponseBody } from '../get_cru_response_body';
import type { StoredVegaLibraryItemState } from '../../vega_saved_object';
import { create } from '../create/create';
import type { VegaUpdateRequestBody, VegaUpdateResponseBody } from './types';

export const update = async (
  requestCtx: RequestHandlerContext,
  id: string,
  body: VegaUpdateRequestBody
): Promise<{ body: VegaUpdateResponseBody; operation: 'create' | 'update' }> => {
  const { core } = await requestCtx.resolve(['core']);

  let isNew = false;
  try {
    await core.savedObjects.client.get<StoredVegaLibraryItemState>(VEGA_SAVED_OBJECT_TYPE, id);
  } catch (e) {
    if (!SavedObjectsErrorHelpers.isNotFoundError(e)) {
      throw e;
    }
    isNew = true;
  }

  if (isNew) {
    return { body: await create(requestCtx, body, id), operation: 'create' };
  }

  const savedObject = await core.savedObjects.client.update<StoredVegaLibraryItemState>(
    VEGA_SAVED_OBJECT_TYPE,
    id,
    body,
    { upsert: body, mergeAttributes: false }
  );
  return { body: getVegaCRUResponseBody(savedObject), operation: 'update' };
};
