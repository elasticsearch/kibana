/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { first } from 'rxjs';
import { addSpanLabels } from '@kbn/apm-utils';
import { schema } from '@kbn/config-schema';
import { reportServerError } from '@kbn/kibana-utils-plugin/server';
import type { IncomingMessage } from 'http';
import type { KibanaExecutionContext } from '@kbn/core-execution-context-common';
import type { Logger } from '@kbn/logging';
import type { ExecutionContextSetup } from '@kbn/core-execution-context-server';
import { reportSearchError } from '../report_search_error';
import { getRequestAbortedSignal } from '../../lib';
import type { DataPluginRouter } from '../types';

export const SEARCH_API_BASE_URL = '/internal/search';

export function registerSearchRoute(
  router: DataPluginRouter,
  logger: Logger,
  executionContextSetup: ExecutionContextSetup
): void {
  router.versioned
    .post({
      path: `${SEARCH_API_BASE_URL}/{strategy}/{id?}`,
      access: 'internal',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
        authc: {
          enabled: 'minimal',
          reason: 'This route is optimized for performant retrieval of data from Elasticsearch.',
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({
              strategy: schema.string(),
              id: schema.maybe(schema.string()),
            }),
            body: schema.object(
              {
                legacyHitsTotal: schema.maybe(schema.boolean()),
                sessionId: schema.maybe(schema.string()),
                isStored: schema.maybe(schema.boolean()),
                isRestore: schema.maybe(schema.boolean()),
                returnIntermediateResults: schema.maybe(schema.boolean()),
                stream: schema.maybe(schema.boolean()),
                requestHash: schema.maybe(schema.string()),
                projectRouting: schema.maybe(schema.string()),
                approximation: schema.maybe(schema.boolean()),
              },
              { unknowns: 'allow' }
            ),
          },
        },
      },
      async (context, request, res) => {
        const {
          legacyHitsTotal = true,
          sessionId,
          isStored,
          isRestore,
          returnIntermediateResults,
          stream,
          requestHash,
          projectRouting,
          approximation,
          ...searchRequest
        } = request.body;
        const { strategy, id } = request.params;
        const abortSignal = getRequestAbortedSignal(request.events.aborted$);

        let executionContext: KibanaExecutionContext | undefined;
        const contextHeader = request.headers['x-kbn-context'];
        try {
          if (contextHeader != null) {
            executionContext = JSON.parse(
              decodeURIComponent(Array.isArray(contextHeader) ? contextHeader[0] : contextHeader)
            );
          }
        } catch (err) {
          logger.error(`Error parsing search execution context: ${contextHeader}`);
        }

        return executionContextSetup.withContext(executionContext, async () => {
          addSpanLabels(executionContextSetup.getAsLabels());
          try {
            const search = await context.search;
            const response = await search
              .search(
                { ...searchRequest, id },
                {
                  abortSignal,
                  strategy,
                  legacyHitsTotal,
                  sessionId,
                  isStored,
                  isRestore,
                  returnIntermediateResults,
                  stream,
                  requestHash,
                  projectRouting,
                  approximation,
                }
              )
              .pipe(first())
              .toPromise();

            if (response && (response.rawResponse as unknown as IncomingMessage).pipe) {
              return res.ok({
                body: response.rawResponse,
                headers: {
                  'kbn-search-is-restored': response.isRestored ? '?1' : '?0',
                  'kbn-search-request-params': JSON.stringify(response.requestParams),
                },
              });
            } else {
              return res.ok({ body: response });
            }
          } catch (err) {
            return reportSearchError(res, err);
          }
        });
      }
    );

  router.versioned
    .delete({
      path: '/internal/search/{strategy}/{id}',
      access: 'internal',
      security: {
        authz: {
          enabled: false,
          reason: 'This route is opted out from authorization',
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: schema.object({
              strategy: schema.string(),
              id: schema.string(),
            }),
          },
        },
      },
      async (context, request, res) => {
        const { strategy, id } = request.params;

        try {
          const search = await context.search;
          await search.cancel(id, { strategy });
          return res.ok();
        } catch (err) {
          return reportServerError(res, err);
        }
      }
    );
}
