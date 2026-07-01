/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const PREBUILT_RULES_OPERATION_SOCKET_TIMEOUT_MS = 1_800_000 as const; // 30 minutes

// Only one rule installation or upgrade request can be processed at a time.
// Multiple requests can lead to high memory usage and unexpected behavior.
export const PREBUILT_RULES_OPERATION_CONCURRENCY = 1;

/**
 * Prebuilt rules upgrade review API endpoint max concurrency.
 *
 * It differs from PREBUILT_RULES_OPERATION_CONCURRENCY since upgrade review API endpoint
 * is expected to be requested much more often than the other prebuilt rules API endpoints.
 */
export const PREBUILT_RULES_UPGRADE_REVIEW_CONCURRENCY = 3;

/**
 * Prebuilt rules installation review API endpoint max concurrency.
 *
 * The value 5 was chosen as a result of performance testing the endpoint.
 * Related issue: https://github.com/elastic/kibana/issues/241656
 */
export const PREBUILT_RULES_INSTALLATION_REVIEW_CONCURRENCY = 5;

// Maximum number of prebuilt rules processed per iteration of the install
// and upgrade loops.
export const PREBUILT_RULE_BATCH_SIZE = 100;

export const PREBUILT_RULES_BULK_CREATE_BATCH_SIZE = 500;
