/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Represents a Microsoft Sentinel Scheduled or Near-Real-Time Analytics Rule as parsed from
 * an ARM template JSON export.
 */
export const SENTINEL_SCHEDULED_RULE_KIND = 'Scheduled';
export const SENTINEL_NRT_RULE_KIND = 'NRT';

export type SentinelRuleKind = typeof SENTINEL_SCHEDULED_RULE_KIND | typeof SENTINEL_NRT_RULE_KIND;

export interface SentinelRule {
  /** The rule's unique identifier (ARM resource name or GUID) */
  id: string;
  /** The Sentinel rule kind */
  kind: SentinelRuleKind;
  /** The rule display name */
  displayName: string;
  /** The rule description */
  description: string;
  /** The KQL query for the rule */
  query: string;
  /** The severity of the rule */
  severity: string;
  /** The Sentinel query lookback period, e.g. "PT5M" */
  queryPeriod?: string;
  /** The Sentinel query run frequency, e.g. "PT5M" */
  queryFrequency?: string;
  /** MITRE ATT&CK tactic IDs, e.g. ["Persistence", "InitialAccess"] */
  tactics?: string[];
  /** MITRE ATT&CK technique IDs, e.g. ["T1078", "T1566"] */
  techniques?: string[];
}
