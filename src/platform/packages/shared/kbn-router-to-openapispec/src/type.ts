/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Router } from '@kbn/core-http-router-server-internal';
import type { OpenAPIV3 } from '../openapi-types';
import type { Env } from './generate_oas';
import type { OnCollision } from './oas_converter/kbn_config_schema/post_process_mutations';
export type { OpenAPIV3 } from '../openapi-types';
export interface KnownParameters {
  [paramName: string]: { optional: boolean };
}

export interface ConvertOptions {
  sharedSchemas?: Map<string, OpenAPIV3.SchemaObject>;
  env?: Env;
  onCollision?: OnCollision;
}

export interface OpenAPIConverter {
  convertPathParameters(
    schema: unknown,
    knownPathParameters: KnownParameters
  ): {
    params: OpenAPIV3.ParameterObject[];
    shared: { [key: string]: OpenAPIV3.SchemaObject };
  };

  convertQuery(schema: unknown): {
    query: OpenAPIV3.ParameterObject[];
    shared: { [key: string]: OpenAPIV3.SchemaObject };
  };

  convert(
    schema: unknown,
    opts?: ConvertOptions
  ): {
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
    shared: { [key: string]: OpenAPIV3.SchemaObject };
  };

  is(type: unknown): boolean;
}

export type CustomOperationObject = OpenAPIV3.OperationObject<{
  // Custom OpenAPI from ES API spec based on @availability
  'x-state'?: string;
}>;

export type InternalRouterRoute = ReturnType<Router['getRoutes']>[0];
