/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Router } from '@kbn/core-http-router-server-internal';
import { getResponseValidation } from '@kbn/core-http-server';
import { BASE_PUBLIC_VERSION as SERVERLESS_VERSION_2023_10_31 } from '@kbn/core-http-router-server-internal';
import type { OpenAPIV3 } from 'openapi-types';
import type { OasConverter } from './oas_converter';
import type { GetOpId } from './util';
import {
  getXsrfHeaderForMethod,
  assignToPaths,
  extractContentType,
  extractTags,
  extractValidationSchemaFromRoute,
  getPathParameters,
  getVersionedContentTypeString,
  mergeResponseContent,
  prepareRoutes,
  setXState,
} from './util';
import type { Env, GenerateOpenApiDocumentOptionsFilters } from './generate_oas';
import type { CustomOperationObject, InternalRouterRoute } from './type';
import { extractAuthzDescription } from './extract_authz_description';
import { mergeOperation } from './merge_operation';

export interface ProcessRouterOptions {
  appRouter: Router;
  converter: OasConverter;
  getOpId: GetOpId;
  filters: GenerateOpenApiDocumentOptionsFilters;
  env?: Env;
}

export const processRouter = async ({
  appRouter,
  converter,
  getOpId,
  filters,
  env = { serverless: false },
}: ProcessRouterOptions) => {
  const paths: OpenAPIV3.PathsObject = {};
  if (filters?.version && filters.version !== SERVERLESS_VERSION_2023_10_31) return { paths };
  const routes = prepareRoutes(appRouter.getRoutes({ excludeVersionedRoutes: true }), filters);

  for (const route of routes) {
    try {
      const pathParams = getPathParameters(route.path);
      const validationSchemas = extractValidationSchemaFromRoute(route);
      const contentType = extractContentType(route.options?.body);

      const parameters: OpenAPIV3.ParameterObject[] = [
        ...getXsrfHeaderForMethod(route.method, route.options),
      ];
      if (validationSchemas) {
        let pathObjects: OpenAPIV3.ParameterObject[] = [];
        let queryObjects: OpenAPIV3.ParameterObject[] = [];
        const reqParams = validationSchemas.params as unknown;
        if (reqParams) {
          pathObjects = converter.convertPathParameters(reqParams, pathParams);
        }
        const reqQuery = validationSchemas.query as unknown;
        if (reqQuery) {
          queryObjects = converter.convertQuery(reqQuery);
        }
        parameters.push(...pathObjects, ...queryObjects);
      }

      let description = `${route.options.description ?? ''}`;
      if (route.security) {
        const authzDescription = extractAuthzDescription(route.security);

        description += `${route.options.description && authzDescription ? `<br/><br/>` : ''}${
          authzDescription ?? ''
        }`;
      }

      const hasDeprecations = !!route.options.deprecated;

      const operation: CustomOperationObject = {
        summary: route.options.summary ?? '',
        tags: route.options.tags ? extractTags(route.options.tags) : [],
        ...(description ? { description } : {}),
        ...(hasDeprecations ? { deprecated: true } : {}),
        ...(route.options.discontinued ? { 'x-discontinued': route.options.discontinued } : {}),
        requestBody: !!validationSchemas?.body
          ? {
              content: {
                [getVersionedContentTypeString(
                  SERVERLESS_VERSION_2023_10_31,
                  'public',
                  contentType
                )]: {
                  schema: converter.convert(validationSchemas.body),
                },
              },
            }
          : undefined,
        responses: extractResponses(route, converter),
        parameters,
        operationId: getOpId({
          path: route.path,
          method: route.method,
          operationId: route.options.operationId,
        }),
      };

      setXState(route.options.availability, operation, env);

      if (route.options.oasOperationObject) {
        await mergeOperation(route.options.oasOperationObject(), operation);
      }

      const path: OpenAPIV3.PathItemObject = {
        [route.method]: operation,
      };
      assignToPaths(paths, route.path, path);
    } catch (e) {
      // Enrich the error message with a bit more context
      e.message = `Error generating OpenAPI for route '${route.path}': ${e.message}`;
      throw e;
    }
  }
  return { paths };
};

export const extractResponses = (route: InternalRouterRoute, converter: OasConverter) => {
  const responses: OpenAPIV3.ResponsesObject = {};
  if (!route.validationSchemas) return responses;
  const fullConfig = getResponseValidation(route.validationSchemas);

  if (fullConfig) {
    const { unsafe, ...validationSchemas } = fullConfig;
    const contentType = extractContentType(route.options?.body);
    return Object.entries(validationSchemas).reduce<OpenAPIV3.ResponsesObject>(
      (acc, [statusCode, schema]) => {
        const newContent = schema.body
          ? {
              [getVersionedContentTypeString(
                SERVERLESS_VERSION_2023_10_31,
                'public',
                schema.bodyContentType ? [schema.bodyContentType] : contentType
              )]: {
                schema: converter.convert(schema.body()),
              },
            }
          : undefined;
        acc[statusCode] = {
          ...acc[statusCode],
          description: schema.description!,
          ...mergeResponseContent(
            ((acc[statusCode] ?? {}) as OpenAPIV3.ResponseObject).content,
            newContent
          ),
        };
        return acc;
      },
      responses
    );
  }

  return responses;
};
