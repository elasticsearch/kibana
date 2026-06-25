/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Minimal HTTP surface used by {@link createChangeHistoryHttpAdapter}. Compatible with Kibana `HttpStart`. */
export interface ChangeHistoryHttpClient {
  get<T = unknown>(
    path: string,
    options?: {
      query?: Record<string, string | number | boolean | undefined>;
      signal?: AbortSignal;
    }
  ): Promise<T>;
}

export interface ChangeHistoryHttpGetOptions {
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}
