/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

interface BaseCustomQueryRule {
  enabled: boolean;
  name: string;
  description: string;
  risk_score: number;
  rule_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'query';
  query: string;
  from: string;
  investigation_fields?: { field_names: string[] };
}

/**
 * A custom query rule reads events from either an index pattern list or a data
 * view, never both. Callers pass exactly one of `index` / `data_view_id`.
 */
export type CustomQueryRule = BaseCustomQueryRule &
  ({ index: string[]; data_view_id?: never } | { data_view_id: string; index?: never });

export const DEFAULT_SECURITY_SOLUTION_INDEXES = [
  'apm-*-transaction*',
  'auditbeat-*',
  'endgame-*',
  'filebeat-*',
  'logs-*',
  'packetbeat-*',
  'traces-apm*',
  'winlogbeat-*',
  '-*elastic-cloud-logs-*',
];

export const CUSTOM_QUERY_RULE: CustomQueryRule = {
  index: DEFAULT_SECURITY_SOLUTION_INDEXES,
  enabled: true,
  name: 'Alert Testing Query',
  description: 'Tests a simple query',
  risk_score: 1,
  rule_id: 'rule-1',
  severity: 'high',
  type: 'query',
  query: '*:*',
  from: '2019-01-01T00:00:00.000Z',
};
