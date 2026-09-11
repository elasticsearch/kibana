/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Example } from '@kbn/evals';

export interface AttackDiscoveryAgentBuilderInput extends Record<string, unknown> {
  question: string;
  triageType: 'provided-alerts' | 'live-retrieval' | 'status-only' | 'multiple-alert-sets';
  expectedSkills: string[];
  expectedToolPath: string[];
  attachments?: Array<{ type: 'security.alerts'; data: { alertIds: string[] } }>;
  executionUuid?: string;
}

export interface AttackDiscovery {
  title: string;
  summaryMarkdown: string;
  detailsMarkdown: string;
  entitySummaryMarkdown?: string;
  mitreAttackTactics?: string[];
  alertIds: string[];
  timestamp?: string;
}

export interface AttackDiscoveryAgentBuilderExpected extends Record<string, unknown> {
  expectedToolPath: string[];
  expectedWorkflowStages: string[];
  expectedRetrievedAlertCount: number | null;
  expectedPassedAlertCount: number | null;
  attackDiscoveries?: AttackDiscovery[];
  criteria?: string[];
}

export interface AttackDiscoveryAgentBuilderMetadata extends Record<string, unknown> {
  alertCount: number;
  fixture:
    | 'provided-alerts'
    | 'live-retrieval'
    | 'missing-alert-retrieval'
    | 'status-only'
    | 'multiple-alert-sets'
    | 'scenario-registry';
  /**
   * Join key a rejudge uses to match a recorded score document back to this
   * example's ground truth. Required, not optional: golden documents carry
   * `example.id = '0'` for almost every attack-discovery row, so this is the
   * only field that distinguishes one scenario from another. The five
   * golden-path scenarios shipped without it and became permanently
   * unreplayable -- a rejudge would have graded all five against the first
   * scenario's references.
   */
  scenarioKey: string;
  seedProfile?: 'clean';
}

export type AttackDiscoveryAgentBuilderExample = Example<
  AttackDiscoveryAgentBuilderInput,
  AttackDiscoveryAgentBuilderExpected,
  AttackDiscoveryAgentBuilderMetadata
>;

export interface AttackDiscoveryAgentBuilderTaskOutput {
  messages: Array<{ message: string }>;
  steps: Array<{ tool_id?: string; results?: unknown[]; [key: string]: unknown }>;
  errors: Array<{ error: { message: string; stack?: string }; type: 'error' }>;
  traceId?: string;
  insights?: AttackDiscovery[] | null;
  adToolResult?: {
    status?: 'completed' | 'pending' | 'error' | null;
    executionUuid?: string;
    alertsContextCount?: number | null;
    discoveryCount?: number | null;
  };
  workflow: {
    stages: string[];
    retrievedAlertCount: number | null;
    passedAlertCount: number | null;
    validatedDiscoveryCount: number | null;
  };
}
