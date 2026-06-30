/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { VersionedRouter } from '@kbn/core-http-server';
import type { RequestHandlerContext } from '@kbn/core/server';
import { commonRouteConfig, PUBLIC_API_VERSION } from '../constants';
import { searchRequestQuerySchema, searchResponseBodySchema } from './schemas';
import { search } from './search';
import { MARKDOWN_API_PATH } from '../../../common/constants';
import { searchMarkdownOASOperationObject } from '../oas_examples';

export function registerSearchRoute(router: VersionedRouter<RequestHandlerContext>) {
  const searchRoute = router.get({
    path: MARKDOWN_API_PATH,
    summary: `Search markdown library items`,
    ...commonRouteConfig,
    description:
      'Returns a paginated list of markdown library items. Each result includes title, description, and metadata, but not the content. Use `GET /api/markdowns/{id}` to retrieve the complete state.',
  });

  searchRoute.addVersion(
    {
      version: PUBLIC_API_VERSION,
      options: {
        oasOperationObject: () => searchMarkdownOASOperationObject,
      },
      validate: {
        request: {
          query: searchRequestQuerySchema,
        },
        response: {
          200: {
            body: () => searchResponseBodySchema,
            description: 'success',
          },
          403: {
            description: 'forbidden',
          },
        },
      },
    },
    async (ctx, req, res) => {
      try {
        const result = await search(ctx, req.query);
        return res.ok({ body: result });
      } catch (e) {
        if (e.isBoom && e.output.statusCode === 403) {
          return res.forbidden({ body: { message: e.message } });
        }

        return res.badRequest({ body: { message: e.message } });
      }
    }
  );
}
