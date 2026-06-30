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
import type { MarkdownUpdateRequestBody, MarkdownUpdateResponseBody } from './types';
import { getMarkdownCRUResponseBody } from '../get_cru_response_body';
import type { StoredMarkdownState } from '../../markdown_saved_object';

export async function update(
  requestCtx: RequestHandlerContext,
  id: string,
  updateBody: MarkdownUpdateRequestBody
): Promise<MarkdownUpdateResponseBody> {
  const { core } = await requestCtx.resolve(['core']);

  const savedObject = await core.savedObjects.client.update<StoredMarkdownState>(
    MARKDOWN_SAVED_OBJECT_TYPE,
    id,
    updateBody,
    {
      upsert: updateBody,
      /** perform a "full" update instead, where the provided attributes will fully replace the existing ones */
      mergeAttributes: false,
    }
  );

  return getMarkdownCRUResponseBody(savedObject);
}
