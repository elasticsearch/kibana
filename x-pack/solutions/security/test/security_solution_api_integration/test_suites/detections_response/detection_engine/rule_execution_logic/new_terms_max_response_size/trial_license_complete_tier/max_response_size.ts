/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Kibana is started with a small `elasticsearch.maxResponseSize` so that a handful of large documents
 * is enough to make the New Terms document fetch response exceed the limit.
 */
export const ELASTICSEARCH_MAX_RESPONSE_SIZE_BYTES = 10 * 1024 * 1024;

export const ELASTICSEARCH_MAX_RESPONSE_SIZE_ARG = `--elasticsearch.maxResponseSize=${ELASTICSEARCH_MAX_RESPONSE_SIZE_BYTES}b`;
