/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DatasetConfig } from '../types';

export const kiQueryGeneration: DatasetConfig['kiQueryGeneration'] = [
  {
    input: {
      scenario_id: 'healthy-baseline',
      stream_name: 'logs',
      stream_description:
        'Bank of Anthos application logs under healthy conditions with normal banking transactions across all microservices',
    },
    output: {
      criteria: [
        {
          id: 'healthy-baseline-queries',
          text: 'Should generate queries for operational monitoring (e.g., transaction throughput, service health, request volume) rather than error-focused detection since this is healthy traffic',
          score: 2,
        },
        {
          id: 'multi-service-coverage',
          text: 'Generated queries should cover multiple services present in the logs (e.g., frontend, ledgerwriter, balancereader, transactionhistory, userservice) rather than a single service only',
          score: 2,
        },
        {
          id: 'error-monitoring',
          text: 'Should generate proactive error detection queries (e.g., connection failures, HTTP errors, service unavailability) even though this is healthy traffic — the model should set up error monitoring based on entity and dependency features',
          score: 2,
          sampling_filters: [
            { match_phrase: { 'body.text': 'Connection refused' } },
            { match_phrase: { 'body.text': 'HTTPConnectionPool' } },
            { match_phrase: { 'body.text': 'Max retries exceeded' } },
          ],
        },
        {
          id: 'stats-aggregate-monitoring',
          text: 'Should generate at least one STATS query for aggregate monitoring (e.g., transaction throughput per service, request volume across ledgerwriter and loadgenerator) with calibrated thresholds documented in descriptions.',
          score: 1,
        },
      ],
      expected_categories: ['operational', 'error'],
      expect_stats: true,
      expected_ground_truth:
        'queries=[operational monitoring for service health/traffic/latency across frontend/ledgerwriter/balancereader/userservice/transactionhistory; proactive error detection using body.text patterns (Connection refused, HTTPConnectionPool, Max retries exceeded) grounded in entity and dependency features; STATS queries for aggregate transaction throughput and request volume monitoring with calibrated thresholds]',
    },
    metadata: {
      difficulty: 'easy',
      failure_domain: 'none',
    },
  },
  {
    input: {
      scenario_id: 'ledger-db-disconnect',
      stream_name: 'logs',
      stream_description:
        'Bank of Anthos logs where the ledger-db PostgreSQL database becomes unreachable, causing frontend, ledgerwriter, balancereader, and transactionhistory to fail',
    },
    output: {
      criteria: [
        {
          id: 'jdbc-error-query',
          text: 'Must generate an ES|QL query that catches JDBC/SQL connection errors (e.g: SQLState: 08001)',
          score: 3,
          sampling_filters: [
            { match_phrase: { 'body.text': 'SQLState: 08001' } },
            { match_phrase: { 'body.text': 'The connection attempt failed' } },
          ],
        },
        {
          id: 'ledger-db-disconnect-impact-query',
          text: 'Should generate a query detecting errors across frontend, ledgerwriter, balancereader, and transactionhistory services',
          score: 2,
          sampling_filters: [
            {
              bool: {
                filter: [
                  { term: { 'resource.attributes.app.keyword': 'frontend' } },
                  { match_phrase: { 'body.text': 'Read timed out' } },
                ],
              },
            },
          ],
        },
        {
          id: 'stats-error-rate-detection',
          text: 'Should generate a STATS query detecting elevated error rates during the ledger-db disconnect (e.g., JDBC connection error frequency spike across ledgerwriter/balancereader/transactionhistory, or cache error rate per service). The STATS query should complement the match-type error detection queries.',
          score: 2,
        },
      ],
      expected_categories: ['error', 'operational'],
      expect_stats: true,
      expected_ground_truth:
        'queries=[error detection for JDBC/SQL error, cache error, timeout, connection refused or connection attempt, upstream impact in frontend/ledgerwriter/balancereader/transactionhistory; STATS queries for aggregate error rate detection during ledger-db disconnect (JDBC error frequency, cache error rate per service)]',
    },
    metadata: {
      difficulty: 'medium',
      failure_domain: 'ledger-db',
      failure_mode: 'database_disconnect',
    },
  },
];
