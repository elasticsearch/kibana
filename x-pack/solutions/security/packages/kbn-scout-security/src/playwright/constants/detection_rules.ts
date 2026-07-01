/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface CustomQueryRule {
  index: string[];
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
