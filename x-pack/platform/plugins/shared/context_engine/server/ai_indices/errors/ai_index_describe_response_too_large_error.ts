/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export class AiIndexDescribeResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(
      `Field metadata for the AI index exceeded the maximum allowed size of ${Math.floor(
        maxBytes / (1024 * 1024)
      )}MB. Point the AI index at fewer or smaller indices.`
    );
    this.name = 'AiIndexDescribeResponseTooLargeError';
  }
}
