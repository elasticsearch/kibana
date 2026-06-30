/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG } from '@kbn/streams-plugin/common/significant_events_tuning_config';
import {
  BANK_OF_ANTHOS_GCS_BASE_PATH_PREFIX,
  BANK_OF_ANTHOS_NAMESPACE,
  GCS_BUCKET,
} from '../constants';
import type { DatasetConfig } from './types';

export const bankOfAnthosDataset: DatasetConfig = {
  id: BANK_OF_ANTHOS_NAMESPACE,
  description: 'Bank of Anthos sample banking microservices application',
  gcs: { bucket: GCS_BUCKET, basePathPrefix: BANK_OF_ANTHOS_GCS_BASE_PATH_PREFIX },
  kiFeatureExtraction: [
    {
      input: {
        scenario_id: 'healthy-baseline',
      },
      output: {
        criteria: [
          {
            id: 'entity-frontend',
            text: 'Must identify frontend service as an entity (evidence: resource.attributes.app=frontend OR resource.attributes.k8s.deployment.name=frontend)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'frontend' } }],
          },
          {
            id: 'entity-userservice',
            text: 'Must identify userservice as an entity (evidence: resource.attributes.app=userservice)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'userservice' } }],
          },
          {
            id: 'entity-contacts',
            text: 'Must identify contacts service as an entity (evidence: resource.attributes.app=contacts)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'contacts' } }],
          },
          {
            id: 'entity-ledgerwriter',
            text: 'Must identify ledgerwriter service as an entity (evidence: resource.attributes.app=ledgerwriter)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'ledgerwriter' } }],
          },
          {
            id: 'entity-balancereader',
            text: 'Must identify balancereader service as an entity (evidence: resource.attributes.app=balancereader)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'balancereader' } }],
          },
          {
            id: 'entity-transactionhistory',
            text: 'Must identify transactionhistory service as an entity (evidence: resource.attributes.app=transactionhistory)',
            score: 2,
            sampling_filters: [
              { term: { 'resource.attributes.app.keyword': 'transactionhistory' } },
            ],
          },
          {
            id: 'entity-ledger-db',
            text: 'Must identify ledger-db as an entity (evidence: resource.attributes.app=ledger-db)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'ledger-db' } }],
          },
          {
            id: 'entity-accounts-db',
            text: 'Must identify accounts-db as an entity (evidence: resource.attributes.app=accounts-db)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'accounts-db' } }],
          },
          {
            id: 'entity-load-generator',
            text: 'Must identify the load generator as an entity (evidence: resource.attributes.app=loadgenerator)',
            score: 1,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'loadgenerator' } }],
          },
          {
            id: 'dep-ledgerwriter-ledger-db',
            text: 'Must identify the dependency ledgerwriter -> ledger-db (evidence: JDBC connections)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'ledgerwriter' } },
                    { match_phrase: { 'body.text': 'JDBC connections' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-balancereader-ledger-db',
            text: 'Must identify the dependency balancereader -> ledger-db (evidence: JDBC read connections for balance lookups)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'balancereader' } },
                    { match_phrase: { 'body.text': 'org.postgresql.jdbc.PgConnection' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-transactionhistory-ledger-db',
            text: 'Must identify the dependency transactionhistory -> ledger-db (evidence: JDBC read connections for transaction history)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'transactionhistory' } },
                    { match_phrase: { 'body.text': 'org.postgresql.jdbc.PgConnection' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-userservice-accounts-db',
            text: 'Must identify the dependency userservice -> accounts-db (evidence: JDBC connections for user account storage)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'userservice' } },
                    {
                      bool: {
                        should: [
                          { match_phrase: { 'body.text': 'create_user' } },
                          { match_phrase: { 'body.text': 'login' } },
                        ],
                        minimum_should_match: 1,
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-frontend-balancereader',
            text: 'Must identify the dependency frontend -> balancereader (evidence: HTTP connection errors from frontend to balancereader:8080)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'frontend' } },
                    {
                      match_phrase: {
                        'body.text': "HTTPConnectionPool(host='balancereader', port=8080)",
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-frontend-ledgerwriter',
            text: 'Must identify the dependency frontend -> ledgerwriter (evidence: HTTP calls from frontend to submit transactions)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'frontend' } },
                    {
                      bool: {
                        should: [
                          {
                            match_phrase: {
                              'body.text': 'payment',
                            },
                          },
                          {
                            match_phrase: {
                              'body.text': 'deposit',
                            },
                          },
                        ],
                        minimum_should_match: 1,
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-frontend-userservice',
            text: 'Must identify the dependency frontend -> userservice (evidence: HTTP calls from frontend for login/account lookup)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'frontend' } },
                    {
                      bool: {
                        should: [
                          { match_phrase: { 'body.text': 'logout' } },
                          { match_phrase: { 'body.text': '_login_helper' } },
                          { match_phrase: { 'body.text': 'signup' } },
                        ],
                        minimum_should_match: 1,
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-loadgenerator-frontend',
            text: 'Should identify the dependency loadgenerator -> frontend (evidence: HTTP request statistics to frontend endpoints)',
            score: 1,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'loadgenerator' } },
                    {
                      bool: {
                        should: [
                          { match_phrase: { 'body.text': '/home' } },
                          { match_phrase: { 'body.text': '/payment' } },
                          { match_phrase: { 'body.text': '/deposit' } },
                          { match_phrase: { 'body.text': '/login' } },
                          { match_phrase: { 'body.text': '/logout' } },
                          { match_phrase: { 'body.text': '/signup' } },
                        ],
                        minimum_should_match: 1,
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'infra-kubernetes',
            text: 'Must identify Kubernetes as infrastructure (evidence: k8s pod/container metadata present)',
            score: 1,
            sampling_filters: [{ exists: { field: 'resource.attributes.k8s.pod.name' } }],
          },
        ],
        min_features: 10,
        max_features: 40,
        required_types: ['entity', 'dependency'],
        expect_entity_filters: true,
        expected_ground_truth:
          'entities=[frontend, userservice, contacts, ledgerwriter, balancereader, transactionhistory, ledger-db, accounts-db], deps=[ledgerwriter->ledger-db, balancereader->ledger-db, transactionhistory->ledger-db, userservice->accounts-db, frontend->balancereader, frontend->ledgerwriter, frontend->userservice, loadgenerator->frontend], infra=[kubernetes]',
      },
      metadata: {
        difficulty: 'easy',
        failure_domain: 'none',
      },
    },
    {
      input: {
        scenario_id: 'ledger-db-disconnect',
        log_query_filter: [
          {
            terms: {
              'resource.attributes.app.keyword': [
                'ledgerwriter',
                'balancereader',
                'transactionhistory',
                'frontend',
              ],
            },
          },
          {
            bool: {
              should: [
                { match_phrase: { 'body.text': 'Failed to retrieve account balance' } },
                { match_phrase: { 'body.text': 'The connection attempt failed' } },
                { match_phrase: { 'body.text': 'getBalance | Cache error' } },
                { match_phrase: { 'body.text': 'getTransactions | Cache error' } },
                { match_phrase: { 'body.text': 'SQLState: 08001' } },
                {
                  match_phrase: {
                    'body.text':
                      "Error submitting payment: HTTPConnectionPool(host='ledgerwriter', port=8080): Read timed out",
                  },
                },
                {
                  match_phrase: {
                    'body.text':
                      "Error getting transaction_list: HTTPConnectionPool(host='transactionhistory', port=8080): Read timed out",
                  },
                },
                {
                  match_phrase: {
                    'body.text':
                      "Error getting balance: HTTPConnectionPool(host='balancereader', port=8080): Read timed out",
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
      output: {
        criteria: [
          {
            id: 'entity-ledgerwriter',
            text: 'Must identify ledgerwriter as a failing entity (evidence: resource.attributes.app=ledgerwriter; JDBC connection errors to ledger-db)',
            score: 2,
            sampling_filters: [
              { term: { 'resource.attributes.app.keyword': 'ledgerwriter' } },
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'ledgerwriter' } },
                    { match_phrase: { 'body.text': 'SQLState: 08001' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'entity-balancereader',
            text: 'Must identify balancereader as a failing entity (evidence: resource.attributes.app=balancereader; cannot read balances from ledger-db, cache errors)',
            score: 2,
            sampling_filters: [
              { term: { 'resource.attributes.app.keyword': 'balancereader' } },
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'balancereader' } },
                    { match_phrase: { 'body.text': 'getBalance | Cache error' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'entity-transactionhistory',
            text: 'Must identify transactionhistory as a failing entity (evidence: resource.attributes.app=transactionhistory; cannot read transactions from ledger-db, cache errors)',
            score: 2,
            sampling_filters: [
              { term: { 'resource.attributes.app.keyword': 'transactionhistory' } },
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'transactionhistory' } },
                    { match_phrase: { 'body.text': 'getTransactions | Cache error' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'entity-frontend',
            text: 'Must identify frontend service (evidence: resource.attributes.app=frontend; upstream impact)',
            score: 1,
            sampling_filters: [
              { term: { 'resource.attributes.app.keyword': 'frontend' } },
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
            id: 'dep-services-ledger-db',
            text: 'Must identify the dependency ledgerwriter/balancereader/transactionhistory -> ledger-db (evidence: SQLState: 08001 connection refused, cache errors surfaced in service logs)',
            score: 3,
            sampling_filters: [
              {
                bool: {
                  should: [
                    {
                      bool: {
                        filter: [
                          { term: { 'resource.attributes.app.keyword': 'ledgerwriter' } },
                          { match_phrase: { 'body.text': 'SQLState: 08001' } },
                        ],
                      },
                    },
                    {
                      bool: {
                        filter: [
                          { term: { 'resource.attributes.app.keyword': 'balancereader' } },
                          { match_phrase: { 'body.text': 'getBalance | Cache error' } },
                        ],
                      },
                    },
                    {
                      bool: {
                        filter: [
                          { term: { 'resource.attributes.app.keyword': 'transactionhistory' } },
                          { match_phrase: { 'body.text': 'getTransactions | Cache error' } },
                        ],
                      },
                    },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'error-signatures',
            text: 'Must reference actual observed error signatures: SQLState: 08001 (PostgreSQL connection refused), cache errors, timeouts in evidence',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  should: [
                    { match_phrase: { 'body.text': 'SQLState: 08001' } },
                    { match_phrase: { 'body.text': 'Cache error' } },
                    { match_phrase: { 'body.text': 'The connection attempt failed' } },
                    { match_phrase: { 'body.text': 'Read timed out' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        ],
        min_features: 3,
        max_features: 20,
        required_types: ['entity', 'dependency'],
        expect_entity_filters: true,
        expected_ground_truth:
          'entities=[ledgerwriter, balancereader, transactionhistory, frontend], deps=[ledgerwriter->ledger-db (connection refused), balancereader->ledger-db (cache error), transactionhistory->ledger-db (cache error)], error_signatures=[SQLState: 08001, cache errors, timeouts]',
      },
      metadata: {
        difficulty: 'medium',
        failure_domain: 'ledger-db',
        failure_mode: 'database_disconnect',
      },
    },
  ],
  kiFeatureDeduplication: [
    {
      input: {
        scenario_id: 'healthy-baseline',
        iterations: DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG.max_iterations,
      },
    },
  ],
  kiFeatureExclusion: [
    {
      input: {
        scenario_id: 'healthy-baseline',
        sample_document_count: 20,
        exclude_count: 4,
        follow_up_runs: 3,
      },
    },
    {
      input: {
        scenario_id: 'healthy-baseline',
        sample_document_count: 20,
        exclude_count: 1,
        follow_up_runs: 3,
      },
    },
  ],
  kiQueryGeneration: [
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
  ],
};
