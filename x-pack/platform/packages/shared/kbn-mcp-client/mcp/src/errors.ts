/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Thrown by McpClient.connect() when the transport or handshake fails.
 * Carries the HTTP status code from the upstream response so callers
 * can classify the failure (e.g. 401/403 → USER error, 5xx → FRAMEWORK).
 */
export class McpConnectionError extends Error {
  readonly httpStatus?: number;

  constructor(message: string, options?: { httpStatus?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'McpConnectionError';
    this.httpStatus = options?.httpStatus;
  }
}
