/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v5 as uuidv5 } from 'uuid';
import { log as synthLog } from '@kbn/synthtrace-client';

/** RFC 4122 v5 DNS namespace UUID — used as the namespace for all deterministic IDs in this seeder. */
export const UUID_V5_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
export const deterministicId = (...parts: string[]) => uuidv5(parts.join(':'), UUID_V5_NAMESPACE);

/**
 * Returns the data stream name that synthtrace's log.createMinimal() routes to.
 * Derived from the same fields the routing transform uses:
 * `${data_stream.type}-${data_stream.dataset}-${data_stream.namespace}`
 */
export function getSynthtraceDefaultStream(): string {
  const {
    'data_stream.type': dsType,
    'data_stream.dataset': dsDataset,
    'data_stream.namespace': dsNamespace,
  } = synthLog.createMinimal().fields;
  return `${dsType}-${dsDataset}-${dsNamespace}`;
}

/**
 * Builds the required ESQL FROM preamble for wired streams.
 * Both the stream and its wildcard child pattern are required, along with
 * METADATA _id, _source (validated server-side by validateEsqlQueryForStreamOrThrow).
 */
export const fromStream = (streamName: string) =>
  `FROM ${streamName}, ${streamName}.* METADATA _id, _source`;

export interface SeedQuery {
  title: string;
  /** Receives streamName at seed time — never hardcoded. */
  esql: (streamName: string) => string;
  severityScore?: number;
  description?: string;
}

export interface SeedScenario {
  /** Name of the scenario key in CLAIMS_APP.scenarios — e.g. 'postgres_timeout'. */
  scenarioName: string;
  queries: SeedQuery[];
}

/**
 * The resolved, post-promotion query identity passed between seed steps.
 * Carries severityScore and description from SeedQuery so downstream steps
 * (seed_tasks, etc.) can use them without re-accessing the scenario definition.
 */
export interface SeededQuery {
  queryId: string;
  ruleId: string; // real rule_id read back from the system after _promote
  title: string;
  esql: string;
  severityScore?: number;
  description?: string;
}

export interface SeedContext {
  esUrl: string;
  kibanaUrl: string;
  username: string;
  password: string;
  streamName: string;
  scenarioName: string;
  seed: number;
  /** Kibana space where seeded assets land. Defaults to 'default'. */
  space: string;
  /** ISO timestamp computed once at run start; threaded to all steps that store generated_at. */
  generatedAt: string;
}
