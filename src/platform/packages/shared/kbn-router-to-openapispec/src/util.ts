/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// eslint-disable-next-line import/no-extraneous-dependencies
import { OpenAPIV3 } from 'openapi-types';
import {
  getRequestValidation,
  type RouteMethod,
  type RouteConfigOptions,
  type RouteConfigOptionsBody,
  type RouterRoute,
  type RouteValidatorConfig,
} from '@kbn/core-http-server';
import type { CustomOperationObject, KnownParameters } from './type';
import type { GenerateOpenApiDocumentOptionsFilters } from './generate_oas';
import type { Env } from './generate_oas';

const tagPrefix = 'oas-tag:';
const extractTag = (tag: string) => {
  if (tag.startsWith(tagPrefix)) {
    return tag.slice(tagPrefix.length);
  }
};
/**
 * Given an array of tags ([oas-tag:beep, oas-tag:boop]) will return a new array
 * with the tag prefix removed.
 */
export const extractTags = (tags?: readonly string[]) => {
  if (!tags) return [];
  return tags.flatMap((tag) => {
    const value = extractTag(tag);
    if (value) {
      return value;
    }
    return [];
  });
};

/**
 * Build the top-level tags entry based on the paths we extracted. We could
 * handle this while we are iterating over the routes, but this approach allows
 * us to keep this as a global document concern at the expense of some extra
 * processing.
 */
export const buildGlobalTags = (paths: OpenAPIV3.PathsObject, additionalTags: string[] = []) => {
  const tags = new Set<string>(additionalTags);
  for (const path of Object.values(paths)) {
    for (const method of Object.values(OpenAPIV3.HttpMethods)) {
      if (path?.[method]?.tags) {
        path[method]!.tags!.forEach((tag) => tags.add(tag));
      }
    }
  }
  return Array.from(tags)
    .sort((a, b) => a.localeCompare(b))
    .map<OpenAPIV3.TagObject>((name) => ({ name }));
};

export const getPathParameters = (path: string): KnownParameters => {
  return Array.from(path.matchAll(/\{([^{}?]+\??)\}/g)).reduce<KnownParameters>((acc, [_, key]) => {
    const optional = key.endsWith('?');
    acc[optional ? key.slice(0, key.length - 1) : key] = { optional };
    return acc;
  }, {});
};

export const extractContentType = (body: undefined | RouteConfigOptionsBody) => {
  if (body?.accepts) {
    return Array.isArray(body.accepts) ? body.accepts : [body.accepts];
  }
  return ['application/json'];
};

export const getVersionedContentTypeString = (
  version: string,
  access: 'public' | 'internal',
  acceptedContentTypes: string[]
): string => {
  if (access === 'internal') {
    return `${acceptedContentTypes.join('; ')}; Elastic-Api-Version=${version}`;
  }
  // Exclude Elastic-Api-Version header for public routes for now, this means public routes
  // can only generate spec for one version at a time.
  return `${acceptedContentTypes.join('; ')}`;
};

export const extractValidationSchemaFromRoute = (
  route: RouterRoute
): undefined | RouteValidatorConfig<unknown, unknown, unknown> => {
  if (!route.validationSchemas) return undefined;
  return getRequestValidation(route.validationSchemas);
};

export const getVersionedHeaderParam = (
  defaultVersion: undefined | string,
  versions: string[]
): OpenAPIV3.ParameterObject => ({
  in: 'header',
  name: 'elastic-api-version',
  description: 'The version of the API to use',
  schema: {
    type: 'string',
    enum: versions,
    default: defaultVersion,
  },
});

export const prepareRoutes = <
  R extends { path: string; options: { access?: 'public' | 'internal'; excludeFromOAS?: boolean } }
>(
  routes: R[],
  filters: GenerateOpenApiDocumentOptionsFilters
): R[] => {
  if (Object.getOwnPropertyNames(filters).length === 0) return routes;
  return routes.filter((route) => {
    if (route.options.excludeFromOAS) return false;
    if (
      filters.excludePathsMatching &&
      filters.excludePathsMatching.some((ex) => route.path.startsWith(ex))
    ) {
      return false;
    }
    if (filters.pathStartsWith && !filters.pathStartsWith.some((p) => route.path.startsWith(p))) {
      return false;
    }
    if (filters.access === 'public' && route.options.access !== 'public') {
      return false;
    }
    if (
      filters.access === 'internal' &&
      route.options.access != null &&
      route.options.access !== 'internal'
    ) {
      return false;
    }
    return true;
  });
};

export const assignToPaths = (
  paths: OpenAPIV3.PathsObject,
  path: string,
  pathObject: OpenAPIV3.PathItemObject
): void => {
  const pathName = path.replace(/[\?\*]/g, '');
  paths[pathName] = { ...paths[pathName], ...pathObject };
};

export const mergeResponseContent = (
  a: OpenAPIV3.ResponseObject['content'],
  b: OpenAPIV3.ResponseObject['content']
) => {
  const mergedContent = {
    ...(a ?? {}),
    ...(b ?? {}),
  };
  return { ...(Object.keys(mergedContent).length ? { content: mergedContent } : {}) };
};

export const getXsrfHeaderForMethod = (
  method: RouteMethod,
  options?: RouteConfigOptions<RouteMethod>
): OpenAPIV3.ParameterObject[] => {
  if (method === 'get' || method === 'options' || options?.xsrfRequired === false) return [];
  return [
    {
      description: 'A required header to protect against CSRF attacks',
      in: 'header',
      name: 'kbn-xsrf',
      required: true,
      schema: {
        example: 'true',
        type: 'string',
      },
    },
  ];
};

export const setXState = (
  availability: RouteConfigOptions<RouteMethod>['availability'],
  operation: CustomOperationObject,
  env: Env
): void => {
  const state = getXState(availability, env);
  if (state !== undefined) {
    operation['x-state'] = state;
  }
};

export const getXState = (
  availability:
    | {
        stability?: 'experimental' | 'stable' | 'tech_preview';
        since?: string;
      }
    | undefined,
  env: Env
): string | undefined => {
  if (!availability) return undefined;

  let state = '';
  if (availability.stability === 'stable') {
    state = 'Generally available';
  } else if (availability.stability === 'tech_preview') {
    state = 'Technical Preview';
  } else if (availability.stability === 'experimental') {
    state = 'Experimental';
  }
  if (!env.serverless && availability.since) {
    state = state ? `${state}; added in ${availability.since}` : `Added in ${availability.since}`;
  }

  return state;
};

export type GetOpId = (input: { path: string; method: string }) => string;

/**
 * Best effort to generate operation IDs from route values
 */
export const createOpIdGenerator = (): GetOpId => {
  const idMap = new Map<string, number>();
  return function getOpId({ path, method }) {
    if (!method || !path) {
      throw new Error(
        `Must provide method and path, received: method: "${method}", path: "${path}"`
      );
    }

    path = path
      .trim()
      .replace(/^[\/]+/, '')
      .replace(/[\/]+$/, '')
      .toLowerCase();

    const removePrefixes = ['internal/api/', 'internal/', 'api/']; // longest to shortest
    for (const prefix of removePrefixes) {
      if (path.startsWith(prefix)) {
        path = path.substring(prefix.length);
        break;
      }
    }

    path = path
      .replace(/[\{\}\?\*]/g, '') // remove special chars
      .replace(/[\/_]/g, '-') // everything else to dashes
      .replace(/[-]+/g, '-'); // single dashes

    const opId = `${method.toLowerCase()}-${path}`;

    const cachedCount = idMap.get(opId) ?? 0;
    idMap.set(opId, cachedCount + 1);
    return cachedCount > 0 ? `${opId}-${cachedCount + 1}` : opId;
  };
};
