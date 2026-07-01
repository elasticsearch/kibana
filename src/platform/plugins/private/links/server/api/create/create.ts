/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandlerContext } from '@kbn/core/server';
import { LINKS_LIBRARY_TYPE } from '../../../common/constants';
import type { StoredLinksState } from '../../links_saved_object';
import { getLinksCRUResponseBody } from '../get_cru_response_body';
import type { LinksCreateRequestBody, LinksCreateResponseBody } from './types';
import { transformIn } from '../../../common/api/transforms';

export async function create(
  requestCtx: RequestHandlerContext,
  createBody: LinksCreateRequestBody,
  id?: string
): Promise<LinksCreateResponseBody> {
  const { core } = await requestCtx.resolve(['core']);

  const { state: soState, references } = transformIn(createBody);
  const savedObject = await core.savedObjects.client.create<StoredLinksState>(
    LINKS_LIBRARY_TYPE,
    soState,
    { references, id }
  );

  return getLinksCRUResponseBody(savedObject);
}
