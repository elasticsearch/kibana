/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IHttpFetchError } from '@kbn/core-http-browser';
import type { ErrorResponse } from '@kbn/alerting-v2-schemas';

const RULE_NOT_FOUND_CODE = 'RULE_NOT_FOUND';

export const isRuleNotFoundError = (error: unknown): boolean => {
  const httpError = error as IHttpFetchError<ErrorResponse> | undefined;

  if (httpError?.response?.status !== 404) {
    return false;
  }

  const code = httpError.body?.code;

  return code === undefined || code === RULE_NOT_FOUND_CODE;
};
