/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG } from '@kbn/streams-plugin/common/significant_events_tuning_config';
import {
  GCS_BUCKET,
  QUARKUS_SUPER_HEROES_GCS_BASE_PATH_PREFIX,
  QUARKUS_SUPER_HEROES_NAMESPACE,
} from '../constants';
import type { DatasetConfig } from './types';

export const quarkusSuperHeroesDataset: DatasetConfig = {
  id: QUARKUS_SUPER_HEROES_NAMESPACE,
  description: 'Quarkus Super Heroes sample microservices application',
  gcs: { bucket: GCS_BUCKET, basePathPrefix: QUARKUS_SUPER_HEROES_GCS_BASE_PATH_PREFIX },
  kiFeatureExtraction: [
    {
      input: {
        scenario_id: 'healthy-baseline',
      },
      output: {
        criteria: [
          {
            id: 'entity-rest-heroes',
            text: 'Must identify rest-heroes service as an entity (evidence: resource.attributes.app=rest-heroes)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'rest-heroes' } }],
          },
          {
            id: 'entity-rest-villains',
            text: 'Must identify rest-villains service as an entity (evidence: resource.attributes.app=rest-villains)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'rest-villains' } }],
          },
          {
            id: 'entity-rest-fights',
            text: 'Must identify rest-fights service as an entity (evidence: resource.attributes.app=rest-fights)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
          },
          {
            id: 'entity-rest-narration',
            text: 'Must identify rest-narration service as an entity (evidence: resource.attributes.app=rest-narration)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'rest-narration' } }],
          },
          {
            id: 'entity-event-statistics',
            text: 'Must identify event-statistics service as an entity (evidence: resource.attributes.app=event-statistics)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'event-statistics' } }],
          },
          {
            id: 'entity-apicurio-registry',
            text: 'Must identify Apicurio Registry as an entity (evidence: resource.attributes.app=apicurio)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'apicurio' } }],
          },
          {
            id: 'entity-heroes-db',
            text: 'Must identify Heroes PostgreSQL DB as an entity (evidence: resource.attributes.app=heroes-db)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'heroes-db' } }],
          },
          {
            id: 'entity-fights-mongodb',
            text: 'Must identify Fights MongoDB as an entity (evidence: resource.attributes.app=fights-db)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'fights-db' } }],
          },
          {
            id: 'entity-fights-kafka',
            text: 'Must identify Fights Kafka Broker as an entity (evidence: resource.attributes.app=fights-kafka)',
            score: 2,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'fights-kafka' } }],
          },
          {
            id: 'entity-villains-db',
            text: 'Must identify Villains PostgreSQL DB as an entity (evidence: resource.attributes.app=villains-db)',
            score: 1,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'villains-db' } }],
          },
          {
            id: 'entity-grpc-locations',
            text: 'Must identify grpc-locations service as an entity (evidence: resource.attributes.app=grpc-locations)',
            score: 1,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'grpc-locations' } }],
          },
          {
            id: 'entity-locations-db',
            text: 'Must identify Locations MariaDB as an entity (evidence: resource.attributes.app=locations-db)',
            score: 1,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'locations-db' } }],
          },
          {
            id: 'entity-ui-super-heroes',
            text: 'Must identify ui-super-heroes as an entity (evidence: resource.attributes.app=ui-super-heroes)',
            score: 1,
            sampling_filters: [{ term: { 'resource.attributes.app.keyword': 'ui-super-heroes' } }],
          },
          {
            id: 'dep-rest-fights-rest-heroes',
            text: 'Must identify the dependency rest-fights -> rest-heroes (evidence: REST calls for hero lookup during fights)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-fights' } },
                    { match_phrase: { 'body.text': 'Hero' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-rest-heroes-heroes-db',
            text: 'Must identify the dependency rest-heroes -> heroes-db (evidence: reactive PostgreSQL database connection)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-heroes' } },
                    { match_phrase: { 'body.text': 'reactive-pg-client' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-rest-fights-rest-villains',
            text: 'Must identify the dependency rest-fights -> rest-villains (evidence: REST calls for villain lookup during fights)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-fights' } },
                    { match_phrase: { 'body.text': 'Villain' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-rest-fights-fights-db',
            text: 'Must identify the dependency rest-fights -> fights-db (evidence: MongoDB connection for fight persistence)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-fights' } },
                    { match_phrase: { 'body.text': 'fights-db' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-rest-villains-villains-db',
            text: 'Must identify the dependency rest-villains -> villains-db (evidence: JDBC PostgreSQL database connection)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-villains' } },
                    { match_phrase: { 'body.text': 'jdbc-postgresql' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-event-statistics-fights-kafka',
            text: 'Must identify the dependency event-statistics -> fights-kafka (evidence: Kafka connection for event consumption)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'event-statistics' } },
                    { match_phrase: { 'body.text': 'messaging-kafka' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-grpc-locations-locations-db',
            text: 'Must identify the dependency grpc-locations -> locations-db (evidence: JDBC MariaDB database connection)',
            score: 1,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'grpc-locations' } },
                    { match_phrase: { 'body.text': 'jdbc-mariadb' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'dep-rest-narration-open-ai',
            text: 'Must identify the dependency rest-narration -> OpenAI/Azure OpenAI (evidence: langchain4j-openai and langchain4j-azure-openai Quarkus extensions)',
            score: 1,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-narration' } },
                    {
                      bool: {
                        should: [
                          { match_phrase: { 'body.text': 'langchain4j-openai' } },
                          { match_phrase: { 'body.text': 'langchain4j-azure-openai' } },
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
            id: 'tech-kubernetes',
            text: 'Must identify Kubernetes as infrastructure (k8s pod/container metadata present)',
            score: 1,
            sampling_filters: [{ exists: { field: 'resource.attributes.k8s.pod.name' } }],
          },
        ],
        min_features: 8,
        max_features: 40,
        required_types: ['entity', 'dependency'],
        expect_entity_filters: true,
        expected_ground_truth:
          'entities=[rest-heroes, rest-villains, rest-fights, rest-narration, event-statistics, apicurio, heroes-db, fights-db, villains-db, fights-kafka, grpc-locations, locations-db, ui-super-heroes], deps=[rest-fights->rest-heroes, rest-heroes->heroes-db, rest-fights->rest-villains, rest-fights->fights-db, rest-villains->villains-db, grpc-locations->locations-db, rest-narration->open-ai, event-statistics->fights-kafka], infra=[kubernetes]',
      },
      metadata: {
        difficulty: 'easy',
        failure_domain: 'none',
      },
    },
    {
      input: {
        scenario_id: 'kafka-disconnect',
        log_query_filter: [
          {
            bool: {
              should: [
                { term: { 'resource.attributes.app.keyword': 'rest-fights' } },
                { term: { 'resource.attributes.app.keyword': 'event-statistics' } },
              ],
              minimum_should_match: 1,
            },
          },
          {
            bool: {
              should: [
                { match_phrase: { 'body.text': 'SRMSG18206' } },
                { match_phrase: { 'body.text': 'SRMSG18212' } },
                { match_phrase: { 'body.text': 'Topic fights not present in metadata' } },
                { match_phrase: { 'body.text': 'Unable to write to Kafka' } },
                {
                  match_phrase: {
                    'body.text': 'org.apache.kafka.common.errors.TimeoutException',
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
            id: 'entity-rest-fights',
            text: 'Must identify rest-fights as a failing entity (Kafka producer failures are present in the logs: unable to write to Kafka, message nacked, SRMSG18206, SRMSG18212)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'SRMSG18206' } },
                    { match_phrase: { 'body.text': 'SRMSG18212' } },
                    { match_phrase: { 'body.text': 'Unable to write to Kafka' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'entity-event-statistics',
            text: 'Must identify event-statistics as a failing entity (evidence:inferred from Kafka broker unreachability - Topic fights not present in metadata, org.apache.kafka.common.errors.TimeoutException)',
            score: 1,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    {
                      match_phrase: {
                        'body.text': 'org.apache.kafka.common.errors.TimeoutException',
                      },
                    },
                    { match_phrase: { 'body.text': 'Topic fights not present in metadata' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'entity-fights-kafka',
            text: 'Must identify fights-kafka as a failing entity (evidence: rest-fights producer logs show fights-kafka broker disconnected, topic not present in metadata, and timeout exceptions)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'fights-kafka' } },
                    { match_phrase: { 'body.text': 'disconnected' } },
                    { match_phrase: { 'body.text': 'Topic fights not present in metadata' } },
                    {
                      match_phrase: {
                        'body.text': 'org.apache.kafka.common.errors.TimeoutException',
                      },
                    },
                  ],
                  minimum_should_match: 2,
                },
              },
            ],
          },
          {
            id: 'dep-rest-fights-fights-kafka',
            text: 'Must identify the dependency rest-fights -> fights-kafka (Kafka producer failing: unable to write or publish fight events)',
            score: 3,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'SRMSG18206' } },
                    { match_phrase: { 'body.text': 'SRMSG18212' } },
                    { match_phrase: { 'body.text': 'Unable to write to Kafka' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'tech-kafka',
            text: 'Must identify Kafka as the affected technology (both producer and consumer sides are failing due to broker unreachability)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  should: [
                    { match_phrase: { 'body.text': 'Unable to write to Kafka' } },
                    { match_phrase: { 'body.text': 'SRMSG18206' } },
                    { match_phrase: { 'body.text': 'SRMSG18212' } },
                    { match_phrase: { 'body.text': 'Topic fights not present in metadata' } },
                    { match_phrase: { 'body.text': 'Bootstrap broker' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'error-signatures',
            text: 'Must reference Kafka failure signals such as unable to write to Kafka, message nacked, topic not present in metadata, connection timeout, or equivalent producer/consumer error descriptions',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  should: [
                    { match_phrase: { 'body.text': 'SRMSG18206' } },
                    { match_phrase: { 'body.text': 'SRMSG18212' } },
                    {
                      match_phrase: {
                        'body.text': 'Topic fights not present in metadata',
                      },
                    },
                    { match_phrase: { 'body.text': 'Unable to write to Kafka' } },
                    {
                      match_phrase: {
                        'body.text': 'org.apache.kafka.common.errors.TimeoutException',
                      },
                    },
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
          'entities=[rest-fights, event-statistics, fights-kafka], deps=[rest-fights->fights-kafka (failed)], tech=[kafka], error_signatures=[SRMSG18206 unable to write, SRMSG18212 message nacked, TimeoutException topic not present in metadata]',
      },
      metadata: {
        difficulty: 'medium',
        failure_domain: 'kafka',
        failure_mode: 'message_broker_disconnect',
      },
    },
    {
      input: {
        scenario_id: 'fights-db-disconnect',
        log_query_filter: [
          {
            term: {
              'resource.attributes.app.keyword': 'rest-fights',
            },
          },
          {
            bool: {
              should: [
                { match_phrase: { 'body.text': 'MongoTimeoutException' } },
                { match_phrase: { 'body.text': 'MongoSocketOpenException' } },
                { match_phrase: { 'body.text': 'Timed out while waiting for a server' } },
                { match_phrase: { 'body.text': 'HTTP Request to /api/fights failed' } },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
      output: {
        criteria: [
          {
            id: 'entity-rest-fights',
            text: 'Must identify rest-fights as the failing entity (evidence: MongoTimeoutException and MongoSocketOpenException in rest-fights logs, HTTP Request to /api/fights failed)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'MongoTimeoutException' } },
                    { match_phrase: { 'body.text': 'MongoSocketOpenException' } },
                    { match_phrase: { 'body.text': 'HTTP Request to /api/fights failed' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'dep-rest-fights-mongodb',
            text: 'Must identify the dependency rest-fights -> fights-db/MongoDB (evidence: MongoTimeoutException: Timed out while waiting for a server, MongoSocketOpenException connecting to dead port)',
            score: 3,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'MongoTimeoutException' } },
                    { match_phrase: { 'body.text': 'MongoSocketOpenException' } },
                    { match_phrase: { 'body.text': 'Timed out while waiting for a server' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'tech-mongodb',
            text: 'Must identify MongoDB as the affected technology (evidence: com.mongodb driver exception classes MongoTimeoutException / MongoSocketOpenException in rest-fights error logs)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'MongoTimeoutException' } },
                    { match_phrase: { 'body.text': 'MongoSocketOpenException' } },
                    { match_phrase: { 'body.text': 'Timed out while waiting for a server' } },
                    { match_phrase: { 'body.text': 'HTTP Request to /api/fights failed' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'error-signatures',
            text: 'Must reference MongoDB error signatures such as MongoTimeoutException (Timed out while waiting for a server that matches WritableServerSelector) or MongoSocketOpenException (Exception opening socket)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'MongoTimeoutException' } },
                    { match_phrase: { 'body.text': 'MongoSocketOpenException' } },
                    { match_phrase: { 'body.text': 'Timed out while waiting for a server' } },
                    { match_phrase: { 'body.text': 'HTTP Request to /api/fights failed' } },
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
          'entities=[rest-fights], deps=[rest-fights->mongodb (failed)], tech=[mongodb], error_signatures=[MongoTimeoutException: Timed out while waiting for a server, MongoSocketOpenException: Exception opening socket, HTTP Request to /api/fights failed]',
      },
      metadata: {
        difficulty: 'medium',
        failure_domain: 'fights-db',
        failure_mode: 'database_disconnect',
      },
    },
    {
      input: {
        scenario_id: 'heroes-service-unreachable',
        log_query_filter: [
          {
            match_phrase: {
              'resource.attributes.app.keyword': 'rest-fights',
            },
          },
          {
            bool: {
              should: [
                { match_phrase: { 'body.text': 'Falling back on Hero' } },
                { match_phrase: { 'body.text': 'Fallback hero' } },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
      output: {
        criteria: [
          {
            id: 'entity-rest-heroes',
            text: 'Must identify rest-heroes as the unreachable target entity (inferred from rest-fights fallback logs — no logs emitted by rest-heroes itself when Stork service discovery redirects to a dead address)',
            score: 1,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'Falling back on Hero' } },
                    { match_phrase: { 'body.text': 'Fallback hero' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'entity-rest-fights',
            text: 'Must identify rest-fights as the affected entity (evidence: "Falling back on Hero" WARN and "Fallback hero" fight results in rest-fights logs)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'Falling back on Hero' } },
                    { match_phrase: { 'body.text': 'Fallback hero' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'dep-rest-fights-rest-heroes',
            text: 'Must identify the dependency rest-fights -> rest-heroes (fight simulation broken)',
            score: 3,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'Falling back on Hero' } },
                    { match_phrase: { 'body.text': 'Fallback hero' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'degradation-signatures',
            text: 'Must reference fault tolerance fallback signals: "Falling back on Hero" (WARN) and fights won by "Fallback hero" — indicating rest-heroes is unreachable and SmallRye Fault Tolerance activated the fallback',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'Falling back on Hero' } },
                    { match_phrase: { 'body.text': 'Fallback hero' } },
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
          'entities=[rest-heroes, rest-fights], deps=[rest-fights->rest-heroes (unreachable, fallback activated)], degradation_signatures=[Falling back on Hero, Villain won over Fallback hero]',
      },
      metadata: {
        difficulty: 'medium',
        failure_domain: 'rest-heroes',
        failure_mode: 'service_unreachable',
      },
    },
    {
      input: {
        scenario_id: 'heroes-db-disconnect',
        log_query_filter: [
          {
            bool: {
              should: [
                { term: { 'resource.attributes.app.keyword': 'rest-heroes' } },
                { term: { 'resource.attributes.app.keyword': 'rest-fights' } },
              ],
              minimum_should_match: 1,
            },
          },
          {
            bool: {
              should: [
                { match_phrase: { 'body.text': 'NoStackTraceThrowable' } },
                { match_phrase: { 'body.text': 'HR000021' } },
                { match_phrase: { 'body.text': 'Falling back on Hero' } },
                { match_phrase: { 'body.text': 'Fallback hero' } },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
      output: {
        criteria: [
          {
            id: 'entity-rest-heroes',
            text: 'Must identify rest-heroes as the failing entity (evidence: Vert.x reactive connection pool timeout at startup — NoStackTraceThrowable: Timeout, HR000021: DDL command failed)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-heroes' } },
                    {
                      bool: {
                        should: [
                          { match_phrase: { 'body.text': 'NoStackTraceThrowable' } },
                          { match_phrase: { 'body.text': 'HR000021' } },
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
            id: 'entity-rest-fights',
            text: 'Must identify rest-fights as an affected upstream entity (evidence: Falling back on Hero / Fallback hero in fight results)',
            score: 1,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-fights' } },
                    {
                      bool: {
                        should: [
                          { match_phrase: { 'body.text': 'Falling back on Hero' } },
                          { match_phrase: { 'body.text': 'Fallback hero' } },
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
            id: 'dep-rest-heroes-heroes-db',
            text: 'Must identify the broken dependency rest-heroes -> heroes-db (evidence: Vert.x reactive pool NoStackTraceThrowable: Timeout connecting to heroes-db)',
            score: 3,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-heroes' } },
                    {
                      bool: {
                        should: [
                          { match_phrase: { 'body.text': 'NoStackTraceThrowable' } },
                          { match_phrase: { 'body.text': 'HR000021' } },
                          { match_phrase: { 'body.text': 'heroes-db' } },
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
            id: 'error-signatures',
            text: 'Must reference reactive connection failure signatures (NoStackTraceThrowable: Timeout, HR000021: DDL command failed, Vert.x reactive pool timeout)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-heroes' } }],
                  should: [
                    { match_phrase: { 'body.text': 'NoStackTraceThrowable: Timeout' } },
                    { match_phrase: { 'body.text': 'HR000021: DDL command failed' } },
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
          'entities=[rest-heroes (reactive pool timeout), rest-fights (degraded)], deps=[rest-heroes->heroes-db (Vert.x timeout)], error_signatures=[NoStackTraceThrowable: Timeout, HR000021: DDL command failed]',
      },
      metadata: {
        difficulty: 'medium',
        failure_domain: 'heroes-db',
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
          'Quarkus Super Heroes application logs under healthy conditions with normal fight simulations across all microservices',
      },
      output: {
        criteria: [
          {
            id: 'operational-monitoring',
            text: 'Should generate queries for operational monitoring (e.g., fight throughput, service health, request volume) across the multi-service environment',
            score: 2,
          },
          {
            id: 'multi-service-coverage',
            text: 'Generated queries should cover multiple services present in the logs (e.g., rest-fights, rest-heroes, rest-villains, event-statistics) rather than a single service only',
            score: 2,
          },
          {
            id: 'stats-aggregate-monitoring',
            text: 'Should generate at least one STATS query for aggregate monitoring (e.g., fight simulation throughput at ~12 fights/min baseline, request volume per microservice) with calibrated thresholds documented in descriptions.',
            score: 1,
          },
        ],
        expected_categories: ['operational'],
        expect_stats: true,
        expected_ground_truth:
          'queries=[operational monitoring for fight throughput/service health across rest-heroes/rest-villains/rest-fights/event-statistics; STATS queries for aggregate fight simulation throughput (~12 fights/min baseline) and request volume per microservice with calibrated thresholds]',
      },
      metadata: {
        difficulty: 'easy',
        failure_domain: 'none',
      },
    },
    {
      input: {
        scenario_id: 'kafka-disconnect',
        stream_name: 'logs',
        stream_description:
          'Quarkus Super Heroes logs where the Kafka broker becomes unreachable, causing rest-fights to fail publishing fight events (SRMSG18206, SRMSG18212, Unable to write to Kafka) and event-statistics to fail consuming them (Topic fights not present in metadata, org.apache.kafka.common.errors.TimeoutException)',
      },
      output: {
        criteria: [
          {
            id: 'kafka-error-query',
            text: 'Must generate an ES|QL query that catches SmallRye Kafka write/nack errors (SRMSG18206 unable to write, SRMSG18212 message nacked, TimeoutException topic not present in metadata). Note: this criterion covers only rest-fights producer errors — event-statistics consumer errors are out of scope for this criterion',
            score: 3,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'SRMSG18206' } },
                    { match_phrase: { 'body.text': 'SRMSG18212' } },
                    {
                      match_phrase: {
                        'body.text': 'TimeoutException: Topic fights not present in metadata',
                      },
                    },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'affected-services-query',
            text: 'Should generate queries detecting Kafka failures in rest-fights (SRMSG18206 unable to write, SRMSG18212 message nacked)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'Unable to write to Kafka' } },
                    { match_phrase: { 'body.text': 'SRMSG18206' } },
                    { match_phrase: { 'body.text': 'SRMSG18212' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'stats-error-rate-detection',
            text: 'Should generate a STATS query detecting the sustained Kafka error rate in rest-fights. The STATS query should complement the match-type error detection queries.',
            score: 2,
          },
        ],
        expected_categories: ['error', 'operational'],
        expect_stats: true,
        expected_ground_truth:
          'queries=[error detection for SmallRye Kafka write failures (SRMSG18206/SRMSG18212/TimeoutException) from rest-fights; STATS queries for sustained Kafka error rate and event-statistics throughput drop]',
      },
      metadata: {
        difficulty: 'medium',
        failure_domain: 'kafka',
        failure_mode: 'message_broker_disconnect',
      },
    },
    {
      input: {
        scenario_id: 'fights-db-disconnect',
        stream_name: 'logs',
        stream_description:
          'Quarkus Super Heroes logs where the MongoDB database backing rest-fights becomes unreachable, causing fight persistence to fail with MongoTimeoutException (Timed out while waiting for a server that matches WritableServerSelector) and MongoSocketOpenException errors',
      },
      output: {
        criteria: [
          {
            id: 'mongo-error-query',
            text: 'Must generate an ES|QL query that catches MongoDB connection errors (MongoTimeoutException: Timed out while waiting for a server, MongoSocketOpenException: Exception opening socket)',
            score: 3,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'MongoTimeoutException' } },
                    { match_phrase: { 'body.text': 'MongoSocketOpenException' } },
                    { match_phrase: { 'body.text': 'Timed out while waiting for a server' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'fights-failure-query',
            text: 'Should generate a query detecting fight simulation failures in rest-fights (HTTP Request to /api/fights failed)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-fights' } },
                    { match_phrase: { 'body.text': 'HTTP Request to /api/fights failed' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'stats-error-rate-detection',
            text: 'Should generate a STATS query detecting the sustained MongoDB error rate in rest-fights. The STATS query should complement the match-type error detection queries.',
            score: 2,
          },
        ],
        expected_categories: ['error', 'operational'],
        expect_stats: true,
        expected_ground_truth:
          'queries=[error detection for MongoTimeoutException/MongoSocketOpenException from rest-fights, fight HTTP failures; STATS queries for sustained MongoDB error rate in rest-fights]',
      },
      metadata: {
        difficulty: 'medium',
        failure_domain: 'fights-db',
        failure_mode: 'database_disconnect',
      },
    },
    {
      input: {
        scenario_id: 'heroes-service-unreachable',
        stream_name: 'logs',
        stream_description:
          'Quarkus Super Heroes logs where the rest-heroes service becomes unreachable — SmallRye Fault Tolerance activates the fallback, producing "Falling back on Hero" WARN logs and fights won by "Fallback hero" in rest-fights. No hard connection errors are surfaced.',
      },
      output: {
        criteria: [
          {
            id: 'fallback-detection-query',
            text: 'Must generate an ES|QL query that detects the fault tolerance fallback activation ("Falling back on Hero" or "Fallback hero") in rest-fights logs',
            score: 3,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-fights' } },
                    { match_phrase: { 'body.text': 'Falling back on Hero' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'fight-degradation-query',
            text: 'Should generate a query detecting fight simulation degradation (villains always winning due to fallback hero)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [
                    { term: { 'resource.attributes.app.keyword': 'rest-fights' } },
                    { match_phrase: { 'body.text': 'Fallback hero' } },
                  ],
                },
              },
            ],
          },
          {
            id: 'stats-fallback-rate-detection',
            text: 'Should generate a STATS query measuring the fallback activation rate in rest-fights. Since there are no errors in this scenario, the fallback rate is the primary signal for STATS-based detection.',
            score: 2,
          },
        ],
        expected_categories: ['resource_health', 'operational'],
        expect_stats: true,
        expected_ground_truth:
          'queries=[fallback activation detection for rest-heroes unreachable (Falling back on Hero, Fallback hero in fight results); STATS queries for fallback activation rate as primary degradation signal (no errors present in this scenario)]',
      },
      metadata: {
        difficulty: 'medium',
        failure_domain: 'rest-heroes',
        failure_mode: 'service_unreachable',
      },
    },
    {
      input: {
        scenario_id: 'heroes-db-disconnect',
        stream_name: 'logs',
        stream_description:
          'Quarkus Super Heroes logs where the heroes PostgreSQL database becomes unreachable via the Vert.x reactive driver, causing rest-heroes to log Vert.x pool timeouts (NoStackTraceThrowable: Timeout, HR000021: DDL command failed) at startup and rest-fights to fall back to a fallback hero for all fight simulations',
      },
      output: {
        criteria: [
          {
            id: 'reactive-db-error-query',
            text: 'Must generate an ES|QL query that catches Vert.x reactive pool timeout errors from rest-heroes (HR000021: DDL command failed or HTTP Request to /api/heroes/random failed — either signature is sufficient)',
            score: 3,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-heroes' } }],
                  should: [
                    { match_phrase: { 'body.text': 'io.vertx.core.impl.NoStackTraceThrowable' } },
                    { match_phrase: { 'body.text': 'HR000021' } },
                    { match_phrase: { 'body.text': 'HTTP Request to /api/heroes/random failed' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'fight-degradation-query',
            text: 'Should generate a query detecting fight degradation in rest-fights (Falling back on Hero / Fallback hero)',
            score: 2,
            sampling_filters: [
              {
                bool: {
                  filter: [{ term: { 'resource.attributes.app.keyword': 'rest-fights' } }],
                  should: [
                    { match_phrase: { 'body.text': 'Falling back on Hero' } },
                    { match_phrase: { 'body.text': 'Fallback hero' } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
          {
            id: 'stats-fallback-rate-detection',
            text: 'Should generate a STATS query measuring the fallback activation rate in rest-fights (~10 fallbacks/min). The rest-heroes hard errors are too sparse (~5 total) for rate-based detection — the sustained fallback rate in rest-fights is the reliable STATS signal for this scenario.',
            score: 2,
          },
        ],
        expected_categories: ['error', 'operational'],
        expect_stats: true,
        expected_ground_truth:
          'queries=[Vert.x reactive pool timeout errors in rest-heroes (NoStackTraceThrowable / HR000021), fight fallback degradation in rest-fights; STATS queries for fallback activation rate in rest-fights as primary detection signal]',
      },
      metadata: {
        difficulty: 'medium',
        failure_domain: 'heroes-db',
        failure_mode: 'database_disconnect',
      },
    },
  ],
};
