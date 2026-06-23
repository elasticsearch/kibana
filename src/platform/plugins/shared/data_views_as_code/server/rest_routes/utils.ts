/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type {
  KibanaRequest,
  RequestHandler,
  RequestHandlerContext,
  RouteMethod,
  StartServicesAccessor,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type Boom from '@hapi/boom';
import { SavedObjectNotFound } from '@kbn/kibana-utils-plugin/common';
import type { ErrorIndexPatternNotFound } from '@kbn/data-views-plugin/server/error';
import { DuplicateDataViewError } from '@kbn/data-views-plugin/common';
import type { DataViewsAsCodeServerPluginStartDependencies } from '../types';
import { DataViewsAsCodeService } from '../services/data_views_as_code_service';

export async function getDataViewsAsCodeService(
  ctx: RequestHandlerContext,
  getStartServices: StartServicesAccessor<DataViewsAsCodeServerPluginStartDependencies, void>,
  req: KibanaRequest
) {
  const core = await ctx.core;
  const savedObjectsClient = core.savedObjects.client;
  const elasticsearchClient = core.elasticsearch.client.asCurrentUser;
  const [, { dataViews }] = await getStartServices();
  const dataViewsService = await dataViews.dataViewsServiceFactory(
    savedObjectsClient,
    elasticsearchClient,
    req
  );
  return new DataViewsAsCodeService(dataViewsService);
}

interface ErrorResponseBody {
  message: string;
  attributes?: object;
}

interface ErrorWithData {
  data?: object;
}

/**
 * This higher order request handler makes sure that errors are returned with
 * body formatted in the following shape:
 *
 * ```json
 * {
 *   "message": "...",
 *   "attributes": {}
 * }
 * ```
 */
export const handleErrors =
  <P, Q, B, Context extends RequestHandlerContext, Method extends RouteMethod>(
    handler: RequestHandler<P, Q, B, Context, Method>
  ): RequestHandler<P, Q, B, Context, Method> =>
  async (context, request, response) => {
    try {
      return await handler(context, request, response);
    } catch (error) {
      if (error instanceof Error) {
        const body: ErrorResponseBody = {
          message: error.message,
        };

        if (typeof (error as ErrorWithData).data === 'object') {
          body.attributes = (error as ErrorWithData).data;
        }

        const is404 =
          (error as ErrorIndexPatternNotFound).is404 ||
          (error as Boom.Boom)?.output?.statusCode === 404 ||
          error instanceof SavedObjectNotFound;

        if (is404) {
          return response.notFound({
            headers: {
              'content-type': 'application/json',
            },
            body,
          });
        }

        const isConflict =
          SavedObjectsErrorHelpers.isConflictError(error) ||
          error instanceof DuplicateDataViewError ||
          (error as Boom.Boom)?.output?.statusCode === 409;

        if (isConflict) {
          return response.conflict({
            headers: {
              'content-type': 'application/json',
            },
            body,
          });
        }

        return response.badRequest({
          headers: {
            'content-type': 'application/json',
          },
          body,
        });
      }

      throw error;
    }
  };
