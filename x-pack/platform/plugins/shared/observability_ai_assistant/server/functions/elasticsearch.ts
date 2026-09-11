/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionRegistrationParameters } from '.';
import { ELASTICSEARCH_FUNCTION_NAME } from '..';

/**
 * Determines if the given HTTP method and path are allowed for the Elasticsearch tool.
 * Only GET requests and POST requests to the "_search" endpoint are permitted.
 *
 * @param method - The HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param path - The Elasticsearch API path
 * @returns true if the operation is allowed, false otherwise
 */
function isOperationAllowed(method: string, path: string): boolean {
  // Allowlist: (1) all GET requests, (2) POST requests whose *final* path segment is exactly "_search".
  const [pathWithoutQuery] = path.split('?');
  const pathSegments = pathWithoutQuery.replace(/^\//, '').split('/');
  const lastPathSegment = pathSegments[pathSegments.length - 1];
  const isSearchEndpoint = lastPathSegment === '_search';

  return method === 'GET' || (method === 'POST' && isSearchEndpoint);
}

export function registerElasticsearchFunction({
  functions,
  resources,
}: FunctionRegistrationParameters) {
  functions.registerFunction(
    {
      name: ELASTICSEARCH_FUNCTION_NAME,
      description:
        'Call Elasticsearch APIs on behalf of the user. Make sure the request body is valid for the API that you are using. Only call this function when the user has explicitly requested it. Only GET requests and requests for /_search (GET and POST) are allowed',
      descriptionForUser: 'Call Elasticsearch APIs on behalf of the user',
      parameters: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            description: 'The HTTP method of the Elasticsearch endpoint',
            enum: ['GET', 'PUT', 'POST', 'DELETE', 'PATCH'] as const,
          },
          path: {
            type: 'string',
            description: 'The path of the Elasticsearch endpoint, including query parameters',
          },
          body: {
            type: 'object',
            description: 'The body of the request',
          },
        },
        required: ['method', 'path'] as const,
      },
    },
    async ({ arguments: { method, path, body } }) => {
      if (!isOperationAllowed(method, path)) {
        throw new Error(
          'Only GET requests or POST requests to the "_search" endpoint are permitted through this assistant function.'
        );
      }

      const esClient = (await resources.context.core).elasticsearch.client;
      const response = await esClient.asCurrentUser.transport.request({
        method,
        path,
        // POST _search: inject project_routing for CPS (stripped automatically when CPS is disabled)
        body:
          isSearchEndpoint && method === 'POST'
            ? { project_routing: '_alias:_origin', ...body }
            : body,
      });

      return { content: { response } };
    }
  );
}
