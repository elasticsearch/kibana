/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getChangeHistoryErrorCode = (body: Record<string, unknown>): string | undefined => {
  if (typeof body.code === 'string') {
    return body.code;
  }

  const attributes = body.attributes;
  if (isRecord(attributes) && typeof attributes.code === 'string') {
    return attributes.code;
  }

  return undefined;
};

export const getChangeHistoryErrorCodeFromBody = (body: unknown): string | undefined =>
  isRecord(body) ? getChangeHistoryErrorCode(body) : undefined;
