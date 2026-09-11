/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  type CoreVersionedRouter,
  versionHandlerResolvers,
  unwrapVersionedResponseBodyValidation,
} from '@kbn/core-http-router-server-internal';
import type {
  RouteMethod,
  VersionedRouteValidation,
  VersionedRouterRoute,
} from '@kbn/core-http-server';
import type { OpenAPIV3 } from 'openapi-types';
import { extractAuthzDescription } from './extract_authz_description';
import type { Env, GenerateOpenApiDocumentOptionsFilters } from './generate_oas';
import type { OasConverter } from './oas_converter';
import type { GetOpId } from './util';
import {
  prepareRoutes,
  getPathParameters,
  extractContentType,
  assignToPaths,
  getVersionedHeaderParam,
  getVersionedContentTypeString,
  extractTags,
  mergeResponseContent,
  getXsrfHeaderForMethod,
  setXState,
} from './util';
import { mergeOperation } from './merge_operation';

export interface ProcessVersionedRouterOptions {
  appRouter: CoreVersionedRouter;
  converter: OasConverter;
  getOpId: GetOpId;
  filters: GenerateOpenApiDocumentOptionsFilters;
  env?: Env;
}

export const processVersionedRouter = async ({
  appRouter,
  converter,
  getOpId,
  filters,
  env = { serverless: false },
}: ProcessVersionedRouterOptions) => {
  const routes = prepareRoutes(appRouter.getRoutes(), filters);
  const paths: OpenAPIV3.PathsObject = {};
  for (const route of routes) {
    const pathParams = getPathParameters(route.path);

    let parameters: OpenAPIV3.ParameterObject[] = [];
    let handler: undefined | VersionedRouterRoute['handlers'][0];
    let version: undefined | string;
    let versions: string[] = versionHandlerResolvers.sort(
      route.handlers.map(({ options: { version: v } }) => v),
      route.options.access
    );

    if (filters?.version) {
      const versionIdx = versions.indexOf(filters.version);
      if (versionIdx === -1) return { paths };
      versions = versions.slice(0, versionIdx + 1);
      handler = route.handlers.find(({ options: { version: v } }) => v === filters.version);
      version = filters.version;
    } else {
      version = versionHandlerResolvers.newest(versions, route.options.access);
      handler = route.handlers.find(({ options: { version: v } }) => v === version);
    }

    if (!handler) return { paths };

    const schemas = extractValidationSchemaFromVersionedHandler(handler);

    try {
      if (schemas) {
        /**
         * Note: for a given route we accept that route params and query params remain BWC
         *       so we only take the latest version of the params and query params, we also
         *       assume at this point that we are generating for serverless.
         */
        const reqParams = schemas.request?.params as unknown;
        let pathObjects: OpenAPIV3.ParameterObject[] = [];
        let queryObjects: OpenAPIV3.ParameterObject[] = [];
        if (reqParams) {
          pathObjects = converter.convertPathParameters(reqParams, pathParams);
        }
        const reqQuery = schemas.request?.query as unknown;
        if (reqQuery) {
          queryObjects = converter.convertQuery(reqQuery);
        }
        parameters = [
          ...getXsrfHeaderForMethod(route.method as RouteMethod, route.options.options),
          ...pathObjects,
          ...queryObjects,
        ];
      }
      parameters = [
        ...(route.options.access === 'internal'
          ? [getVersionedHeaderParam(version, versions)]
          : ([] as OpenAPIV3.ParameterObject[])),
      ].concat(...parameters);
      let description = `${route.options.description ?? ''}`;
      if (route.options.security) {
        const authzDescription = extractAuthzDescription(route.options.security);

        description += `${route.options.description && authzDescription ? '<br/><br/>' : ''}${
          authzDescription ?? ''
        }`;
      }

      const hasBody = Boolean(extractValidationSchemaFromVersionedHandler(handler)?.request?.body);
      const contentType = extractContentType(route.options.options?.body);
      // If any handler is deprecated we show deprecated: true in the spec
      const hasDeprecations = route.handlers.some(({ options }) => !!options.options?.deprecated);
      const operationId = getOpId({
        path: route.path,
        method: route.method,
        operationId: route.options.operationId,
      });
      const operation: OpenAPIV3.OperationObject = {
        summary: route.options.summary ?? '',
        tags: route.options.options?.tags ? extractTags(route.options.options.tags) : [],
        ...(description ? { description } : {}),
        ...(hasDeprecations ? { deprecated: true } : {}),
        ...(route.options.discontinued ? { 'x-discontinued': route.options.discontinued } : {}),
        requestBody: hasBody
          ? {
              content: extractVersionedRequestBody(
                handler,
                route.options.access,
                converter,
                contentType
              ),
            }
          : undefined,
        responses: extractVersionedResponse(handler, route, converter, contentType, operationId),
        parameters,
        operationId,
      };

      setXState(route.options.options?.availability, operation, env);

      if (handler.options.options?.oasOperationObject) {
        await mergeOperation(handler.options.options.oasOperationObject(), operation);
      }

      const path: OpenAPIV3.PathItemObject = {
        [route.method]: operation,
      };

      assignToPaths(paths, route.path, path);
    } catch (e) {
      // Enrich the error message with a bit more context
      e.message = `Error generating OpenAPI for route '${route.path}' using newest version '${version}': ${e.message}`;
      throw e;
    }
  }
  return { paths };
};

export const extractVersionedRequestBody = (
  handler: VersionedRouterRoute['handlers'][0],
  access: 'public' | 'internal',
  converter: OasConverter,
  contentType: string[]
) => {
  const schemas = extractValidationSchemaFromVersionedHandler(handler);
  if (!schemas?.request) return {};
  const schema = converter.convert(schemas.request.body);
  return {
    [getVersionedContentTypeString(handler.options.version, access, contentType)]: {
      schema,
    },
  };
};

export const extractVersionedResponse = (
  handler: VersionedRouterRoute['handlers'][0],
  route: VersionedRouterRoute,
  converter: OasConverter,
  contentType: string[],
  operationId: string
) => {
  const schemas = extractValidationSchemaFromVersionedHandler(handler);
  if (!schemas?.response) return {};
  const result: OpenAPIV3.ResponsesObject = {};
  const { unsafe, ...responses } = schemas.response;
  for (const [statusCode, responseSchema] of Object.entries(responses)) {
    let newContent: OpenAPIV3.ResponseObject['content'];
    if (responseSchema.body) {
      const maybeSchema = unwrapVersionedResponseBodyValidation(responseSchema.body);
      const schema = converter.convert(maybeSchema);
      const contentTypeString = getVersionedContentTypeString(
        handler.options.version,
        route.options.access,
        responseSchema.bodyContentType ? [responseSchema.bodyContentType] : contentType
      );
      newContent = {
        [contentTypeString]: {
          schema,
        },
      };
    }
    result[statusCode] = {
      ...result[statusCode],
      description: responseSchema.description!,
      ...mergeResponseContent(
        ((result[statusCode] ?? {}) as OpenAPIV3.ResponseObject).content,
        newContent
      ),
    };
  }
  return result;
};

const extractValidationSchemaFromVersionedHandler = (
  handler: VersionedRouterRoute['handlers'][0]
): VersionedRouteValidation<unknown, unknown, unknown> | undefined => {
  if (handler.options.validate === false) return undefined;
  const validation =
    typeof handler.options.validate === 'function'
      ? handler.options.validate()
      : handler.options.validate;
  return validation;
};
