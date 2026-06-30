/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CreateExceptionListSchema } from '@kbn/securitysolution-io-ts-list-types';

import {
  DESCRIPTION,
  DETECTION_TYPE,
  ENDPOINT_TYPE,
  LIST_ID,
  META,
  NAME,
  NAMESPACE_TYPE,
  VERSION,
} from '../../constants.mock';

export const getCreateExceptionListSchemaMock = (): CreateExceptionListSchema => ({
  description: DESCRIPTION,
  list_id: undefined,
  meta: META,
  name: NAME,
  namespace_type: NAMESPACE_TYPE,
  os_types: [],
  tags: [],
  type: ENDPOINT_TYPE,
  version: VERSION,
});

/**
 * Useful for end to end testing
 */
export const getCreateExceptionListMinimalSchemaMock = (
  overrides: Partial<CreateExceptionListSchema> = {}
): CreateExceptionListSchema => ({
  description: DESCRIPTION,
  list_id: LIST_ID,
  name: NAME,
  type: ENDPOINT_TYPE,
  ...overrides,
});

/**
 * Useful for end to end testing
 */
export const getCreateExceptionListMinimalSchemaMockWithoutId = (): CreateExceptionListSchema => ({
  description: DESCRIPTION,
  name: NAME,
  type: ENDPOINT_TYPE,
});

/**
 * Useful for end to end testing with detections
 */
export const getCreateExceptionListDetectionSchemaMock = (): CreateExceptionListSchema => ({
  description: DESCRIPTION,
  list_id: LIST_ID,
  name: NAME,
  type: DETECTION_TYPE,
});
