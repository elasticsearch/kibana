/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Converts a backing index name to its parent data stream name.
 * Returns the input unchanged when it is not a backing index.
 *
 * @example
 * ".ds-logs-aws.cloudtrail-default-2026.01.01-000001" → "logs-aws.cloudtrail-default"
 * "logs-aws.cloudtrail-default"                       → "logs-aws.cloudtrail-default"
 */
export const toDataStreamName = (index: string): string => {
  const match = index.match(/^\.ds-(.+)-\d{4}\.\d{2}\.\d{2}-\d+$/);
  return match?.[1] ?? index;
};
