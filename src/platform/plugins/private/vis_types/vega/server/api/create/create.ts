/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandlerContext } from '@kbn/core/server';
import { VEGA_SAVED_OBJECT_TYPE } from '../../../common/constants';
import type { VegaCreateRequestBody, VegaCreateResponseBody } from './types';
import { getVegaCRUResponseBody } from '../get_cru_response_body';
import type { StoredVegaLibraryItemState } from '../../vega_saved_object';

export const create = async (
  requestCtx: RequestHandlerContext,
  createBody: VegaCreateRequestBody,
  id?: string
): Promise<VegaCreateResponseBody> => {
  const { core } = await requestCtx.resolve(['core']);

  const savedObject = await core.savedObjects.client.create<StoredVegaLibraryItemState>(
    VEGA_SAVED_OBJECT_TYPE,
    createBody,
    { id }
  );

  return getVegaCRUResponseBody(savedObject);
};
