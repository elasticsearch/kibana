/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchError, ElasticsearchErrorCausedByObject } from './types';

const getEsCause = (
  obj: ElasticsearchErrorCausedByObject = {},
  causes: string[] = []
): string[] => {
  const updated = [...causes];

  const authMessage = obj.additional_unsuccessful_credentials;
  if (typeof authMessage === 'string') {
    updated.push(authMessage);
  }

  if (obj.caused_by) {
    if (obj.caused_by?.reason) {
      updated.push(obj.caused_by?.reason);
    }

    // Recursively find all the "caused by" reasons
    return getEsCause(obj.caused_by, updated);
  }

  if (obj.failed_shards && obj.failed_shards.length) {
    for (const failure of obj.failed_shards) {
      if (failure && failure.reason) {
        updated.push(...getEsCause(failure.reason));
      }
    }
  }

  return updated.filter(Boolean);
};

export const getEsErrorMessage = (error: ElasticsearchError) => {
  let message = error?.message;
  const apiError = error?.error?.meta?.body?.error ?? error?.meta?.body?.error;
  if (apiError) {
    message += `, caused by: "${getEsCause(apiError as ElasticsearchErrorCausedByObject)}"`;
  }
  return message;
};
