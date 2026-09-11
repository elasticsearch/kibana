/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export class AiIndexQueryResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(
      `ES|QL query response exceeded the maximum allowed size of ${Math.floor(
        maxBytes / (1024 * 1024)
      )}MB. Narrow the query with tighter filters, a smaller LIMIT, or fewer fields.`
    );
    this.name = 'AiIndexQueryResponseTooLargeError';
  }
}
