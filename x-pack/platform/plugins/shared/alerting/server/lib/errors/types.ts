/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { KibanaResponseFactory, IKibanaResponse } from '@kbn/core/server';

export interface ErrorThatHandlesItsOwnResponse extends Error {
  sendResponse(res: KibanaResponseFactory): IKibanaResponse;
}

export interface ElasticsearchErrorCausedByObject {
  reason?: string;
  caused_by?: ElasticsearchErrorCausedByObject;
  failed_shards?: Array<{
    reason?: {
      caused_by?: ElasticsearchErrorCausedByObject;
    };
  }>;
  additional_unsuccessful_credentials?: string;
}

interface ElasticsearchErrorMeta {
  body?: {
    error?: ElasticsearchErrorCausedByObject;
  };
}

export interface ElasticsearchError extends Error {
  error?: {
    meta?: ElasticsearchErrorMeta;
  };
  meta?: ElasticsearchErrorMeta;
}
