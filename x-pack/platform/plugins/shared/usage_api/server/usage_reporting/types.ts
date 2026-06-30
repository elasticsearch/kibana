/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Usage Record Schema v2 - matches the Serverless metering pipeline schema.
 *
 * Stage 1 (Kibana) populates: id, usage_timestamp, creation_timestamp, usage.type,
 * usage.quantity, usage.period_seconds, usage.metadata, source.id, source.instance_group_id,
 * and source.instance_group_type. Stage 1 may also provide source.provider and source.region
 * when running in ECH, where the Usage API cannot infer them.
 *
 * Stage 2 (Usage API) enriches with: source.account, source.product, and (if not already
 * provided) source.provider and source.region.
 * Stage 3 (Transform function) adds: usage.pli, usage.count.
 */
export interface UsageRecord {
  /** Unique ID for deduplication. Must be deterministic per execution to prevent overbilling. */
  id: string;
  /** When the usage occurred (ISO 8601). */
  usage_timestamp: string;
  /** When the record was created, immediately before sending (ISO 8601). */
  creation_timestamp: string;
  usage: UsageMetrics;
  source: UsageSource;
}

export interface UsageMetrics {
  /** The metered dimension/resource. Must be unique and agreed upon with Billing team. */
  type: string;
  /** Optional sub-group for further breakdown (e.g., step type). */
  sub_type?: string;
  /** Measured quantity. For discrete events like workflow executions, this is 1. */
  quantity: number;
  /** Duration of usage represented by this record in seconds. */
  period_seconds?: number;
  /** Underlying cause of the usage (low cardinality identifier). */
  cause?: string;
  /** Additional metadata for filtering/categorization in Stage 3 transform functions. */
  metadata?: Record<string, string>;
}

export interface UsageSource {
  /** Identifies the system that wrote the record. Should map to something in logs for debugging. */
  id: string;
  /** Serverless project ID or stateful deployment ID. */
  instance_group_id: string;
  /** Describes the identifier in instance_group_id. */
  instance_group_type?: 'serverless_project' | 'stateful_deployment' | 'cloud_connect';
  /** Cloud service provider (e.g., `aws`, `gcp`, `azure`). */
  provider?: string;
  /** Cloud region (e.g., `us-east-1`, `europe-west1`). */
  region?: string;
  /** Optional metadata such as product tier. */
  metadata?: {
    /** Elasticsearch resource ID from the Cloud ID. */
    cluster_id?: string;
    tier?: string;
  };
}
