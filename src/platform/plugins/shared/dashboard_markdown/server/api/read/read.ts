/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandlerContext } from '@kbn/core/server';
import { MARKDOWN_SAVED_OBJECT_TYPE } from '../../../common/constants';
import { getMarkdownCRUResponseBody } from '../get_cru_response_body';
import type { MarkdownReadResponseBody } from './types';
import type { StoredMarkdownState } from '../../markdown_saved_object';

export async function read(
  requestCtx: RequestHandlerContext,
  id: string
): Promise<MarkdownReadResponseBody> {
  const { core } = await requestCtx.resolve(['core']);
  const { saved_object: savedObject } = await core.savedObjects.client.resolve<StoredMarkdownState>(
    MARKDOWN_SAVED_OBJECT_TYPE,
    id
  );

  return getMarkdownCRUResponseBody(savedObject);
}
