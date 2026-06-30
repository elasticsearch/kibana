/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  FindMutedAlertInstancesResponse,
  FindMutedAlertInstancesRequestBody,
} from './types/v1';

export {
  findMutedAlertInstancesRequestBodySchema as findMutedAlertInstancesRequestBodySchemaV1,
  findMutedAlertInstancesResponseSchema as findMutedAlertInstancesResponseSchemaV1,
} from './schemas/v1';

export type {
  FindMutedAlertInstancesRequestBody as FindMutedAlertInstancesRequestBodyV1,
  FindMutedAlertInstancesResponse as FindMutedAlertInstancesResponseV1,
} from './types/v1';
