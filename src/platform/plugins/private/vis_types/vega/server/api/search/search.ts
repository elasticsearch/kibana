/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandlerContext } from '@kbn/core/server';
import { getMeta } from '@kbn/as-code-shared-schemas';
import { VEGA_SAVED_OBJECT_TYPE } from '../../../common/constants';
import type { VegaSearchRequestQuery, VegaSearchResponseBody } from './types';
import type { StoredVegaLibraryItemState } from '../../vega_saved_object';

export const search = async (
  requestCtx: RequestHandlerContext,
  searchQuery: VegaSearchRequestQuery
): Promise<VegaSearchResponseBody> => {
  const { core } = await requestCtx.resolve(['core']);
  const soResponse = await core.savedObjects.client.find<StoredVegaLibraryItemState>({
    type: VEGA_SAVED_OBJECT_TYPE,
    searchFields: ['title^3', 'description'],
    fields: ['description', 'title'],
    search: searchQuery.query,
    perPage: searchQuery.per_page,
    page: searchQuery.page ? +searchQuery.page : undefined,
    defaultSearchOperator: 'AND',
  });

  return {
    data: soResponse.saved_objects.map((so) => {
      const { description, title } = so.attributes;

      return {
        id: so.id,
        data: {
          ...(description && { description }),
          title: title ?? '',
        },
        meta: getMeta(so),
      };
    }),
    meta: {
      page: soResponse.page,
      per_page: soResponse.per_page,
      total: soResponse.total,
    },
  };
};
