/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NewOutput, OutputType, ValueOf } from '../types';

export const OUTPUT_SAVED_OBJECT_TYPE = 'ingest-outputs';

export const outputType = {
  Elasticsearch: 'elasticsearch',
  Logstash: 'logstash',
  Kafka: 'kafka',
  RemoteElasticsearch: 'remote_elasticsearch',
} as const;

export const DEFAULT_OUTPUT_ID = 'fleet-default-output';

export const DEFAULT_OUTPUT: NewOutput = {
  name: 'default',
  is_default: true,
  is_default_monitoring: true,
  type: outputType.Elasticsearch,
  hosts: [''],
};

export const SERVERLESS_DEFAULT_OUTPUT_ID = 'es-default-output';

// Output IDs used for agentless policies:
//  - For ECH, this is an output created by Fleet, see `ensureDefaultOutputs()` in
//    `x-pack/plugins/fleet/server/services/output.ts`
//  - For Serverless, this is the `es-internal-output` output that is created from
//    preconfiguration via project controller with internal cluster URLs
//  - Both are uneditable by users due to having `is_preconfigured: true` set
export const ECH_AGENTLESS_OUTPUT_ID = 'es-agentless-output';
export const SERVERLESS_AGENTLESS_OUTPUT_ID = 'es-default-output-internal';

export const LICENCE_FOR_PER_POLICY_OUTPUT = 'platinum';
export const LICENCE_FOR_OUTPUT_PER_INTEGRATION = 'enterprise';

/**
 * Kafka constants
 */

export const kafkaCompressionType = {
  None: 'none',
  Snappy: 'snappy',
  Lz4: 'lz4',
  Gzip: 'gzip',
} as const;

export const kafkaAuthType = {
  Userpass: 'user_pass',
  Ssl: 'ssl',
  Kerberos: 'kerberos',
  None: 'none',
} as const;

export const kafkaConnectionType = {
  Plaintext: 'plaintext',
  Encryption: 'encryption',
} as const;

export const kafkaSaslMechanism = {
  Plain: 'PLAIN',
  ScramSha256: 'SCRAM-SHA-256',
  ScramSha512: 'SCRAM-SHA-512',
} as const;

export const kafkaPartitionType = {
  Random: 'random',
  RoundRobin: 'round_robin',
  Hash: 'hash',
} as const;

export const kafkaTopicsType = {
  Static: 'static',
  Dynamic: 'dynamic',
} as const;

export const kafkaTopicWhenType = {
  Equals: 'equals',
  Contains: 'contains',
  Regexp: 'regexp',
} as const;

export const kafkaAcknowledgeReliabilityLevel = {
  Commit: 1,
  Replica: -1,
  DoNotWait: 0,
} as const;

export const kafkaVerificationModes = {
  Full: 'full',
  None: 'none',
  Strict: 'strict',
  Certificate: 'certificate',
} as const;

export const kafkaSupportedVersions = [
  '0.8.2.0',
  '0.8.2.1',
  '0.8.2.2',
  '0.9.0.0',
  '0.9.0.1',
  '0.10.0.0',
  '0.10.0.1',
  '0.10.1.0',
  '0.10.1.1',
  '0.10.2.0',
  '0.10.2.1',
  '0.10.2.2',
  '0.11.0.0',
  '0.11.0.1',
  '0.11.0.2',
  '0.11.0.3',
  '1.0.0',
  '1.0.1',
  '1.0.2',
  '1.1.0',
  '1.1.1',
  '2.0.0',
  '2.0.1',
  '2.1.0',
  '2.1.1',
  '2.2.0',
  '2.2.1',
  '2.2.2',
  '2.3.0',
  '2.3.1',
  '2.4.0',
  '2.4.1',
  '2.5.0',
  '2.5.1',
  '2.6.0',
];

export const RESERVED_CONFIG_YML_KEYS = [
  'bulk_max_size',
  'compression_level',
  'connection_idle_timeout',
  'queue.mem.events',
  'queue.mem.flush.min_events',
  'queue.mem.flush.timeout',
  'worker',
];

export const kafkaTopicsOptions = [
  {
    id: kafkaTopicsType.Static,
    label: 'Static Topic',
    'data-test-subj': 'kafkaTopicStaticRadioButton',
  },
  {
    id: kafkaTopicsType.Dynamic,
    label: 'Dynamic Topic',
    'data-test-subj': 'kafkaTopicDynamicRadioButton',
  },
];

export const KAFKA_DYNAMIC_FIELDS = [
  'data_stream.type',
  'data_stream.dataset',
  'data_stream.namespace',
  '@timestamp',
  'event.dataset',
];

export const OUTPUT_TYPES_WITH_PRESET_SUPPORT: Array<ValueOf<OutputType>> = [
  outputType.Elasticsearch,
  outputType.RemoteElasticsearch,
];

export const OUTPUT_TYPES_WITH_OTEL_EXPORTER_SUPPORT: Array<ValueOf<OutputType>> = [
  outputType.Elasticsearch,
  outputType.RemoteElasticsearch,
];

export const OUTPUT_HEALTH_DATA_STREAM = 'logs-fleet_server.output_health-default';

export const LOGSTASH_API_KEY_CLUSTER_PERMISSIONS = ['monitor', 'manage_own_api_key'];

export const LOGSTASH_API_KEY_INDICES_PRIVILEGES = ['auto_configure', 'create_doc'];

export const LOGSTASH_API_KEY_INDICES = [
  'logs-*-*',
  'metrics-*-*',
  'traces-*-*',
  'synthetics-*-*',
  '.logs-endpoint.diagnostic.collection-*',
  '.logs-endpoint.action.responses-*',
  'profiling-*',
  '.profiling-*',
  'profiles-*',
];
